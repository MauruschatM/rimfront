import type { SpatialHash } from "./spatial";
import type { Building, Entity, Troop } from "./types";
import { updateMember } from "./unitBehavior";

export async function processActiveEntities(
  ctx: { db: any },
  activeEntities: Entity[],
  troops: Troop[],
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  workshops: Building[],
  houses: Building[],
  barracks: Building[],
  turrets: Building[],
  walls: Building[],
  playerCredits: Record<string, number>,
  spatialHash: SpatialHash,
  entities: Entity[],
  isRoundTick: boolean,
  poweredBuildingIds: Set<string>,
  playerBetrayalTimes: Record<string, number>,
  alliances: Set<string>, // Set of "id1:id2" allied pairs
  playerTeams: Record<string, string> // Map of playerId -> teamId
): Promise<boolean> {
  const deletedEntityIds = new Set<string>();
  let buildingsDamaged = false;

  for (const entity of activeEntities) {
    if (deletedEntityIds.has(entity._id)) {
      continue;
    }

    let dirty = false;
    const troop = entity.troopId
      ? troops.find((t) => t._id === entity.troopId)
      : undefined;
    const targetPos = troop?.targetPos;

    // Check Confused State
    const betrayalTime = playerBetrayalTimes[entity.ownerId];
    const isConfused = betrayalTime && now < betrayalTime + 60_000;

    // Movement Logic
    if (
      entity.type !== "turret_gun" && // Turret guns don't move
      updateMember(
        entity,
        now,
        mapWidth,
        mapHeight,
        blocked,
        targetPos,
        workshops,
        houses,
        entities,
        isRoundTick,
        !!isConfused
      )
    ) {
      dirty = true;
    }

    // Combat Logic (Soldiers & Turrets)
    if (entity.type === "soldier" || entity.type === "turret_gun") {
      let canFire = true;
      let range = 10;
      let damage = 1;
      const cooldown = 1000;
      let accuracy = 0.8;

      // Penalties for confused state
      if (isConfused) {
        range = 5;
        accuracy = 0.2;
      }

      // Turret specific logic
      if (entity.type === "turret_gun") {
        range = 15;
        if (isConfused) range = 7; // Half range for confused turret? Or just blind?

        damage = 100; // High damage
        // Check power
        if (entity.buildingId && !poweredBuildingIds.has(entity.buildingId)) {
          canFire = false;
        }
      }

      if (
        canFire &&
        (!entity.lastAttackTime || now > entity.lastAttackTime + cooldown)
      ) {
        // Query for all enemies in range
        const enemies = spatialHash.query(entity.x, entity.y, range).filter(
          (e) =>
            e.ownerId !== entity.ownerId &&
            !deletedEntityIds.has(e.id) &&
            // Turrets don't attack buildings, only units
            (entity.type !== "turret_gun" || e.type !== "building") &&
            // Check Alliances: Ignore if allied or SAME TEAM
            !alliances.has(
              entity.ownerId < e.ownerId
                ? `${entity.ownerId}:${e.ownerId}`
                : `${e.ownerId}:${entity.ownerId}`
            ) &&
            !(
              playerTeams[entity.ownerId] &&
              playerTeams[e.ownerId] &&
              playerTeams[entity.ownerId] === playerTeams[e.ownerId]
            )
        );

        // Separate units from buildings for priority targeting
        const enemyUnits = enemies.filter((e) => e.type !== "building");
        const enemyBuildings = enemies.filter((e) => e.type === "building");

        // Priority 1: Self-defense - attack nearest enemy UNIT first
        let target: {
          id: string;
          x: number;
          y: number;
          type: string;
        } | null = null;
        let minDist = Number.POSITIVE_INFINITY;

        for (const enemy of enemyUnits) {
          const dist = (enemy.x - entity.x) ** 2 + (enemy.y - entity.y) ** 2;
          if (dist < minDist) {
            minDist = dist;
            target = enemy;
          }
        }

        // Priority 2: If no enemy units, check commander's target building
        if (!target && troop?.targetBuildingId && entity.type === "soldier") {
          const commanderTarget = enemyBuildings.find(
            (b) => b.id === troop.targetBuildingId
          );
          if (commanderTarget) {
            target = commanderTarget;
          }
        }

        // Priority 3: If still no target, attack nearest building
        if (!target && entity.type === "soldier") {
          for (const enemy of enemyBuildings) {
            const dist = (enemy.x - entity.x) ** 2 + (enemy.y - entity.y) ** 2;
            if (dist < minDist) {
              minDist = dist;
              target = enemy;
            }
          }
        }

        if (target) {
          // Attack
          entity.lastAttackTime = now;
          entity.attackTargetId = target.id;
          entity.attackEndTime = now + 200; // Laser visual duration
          dirty = true;

          // Resolve Hit (Server-side)
          if (Math.random() < accuracy) {
            // Hit!
            if (target.type === "building") {
              // Damage Building
              const building =
                workshops.find((b) => b.id === target?.id) ||
                houses.find((b) => b.id === target?.id) ||
                barracks.find((b) => b.id === target?.id) ||
                turrets.find((b) => b.id === target?.id) ||
                walls.find((b) => b.id === target?.id);

              if (building) {
                building.health = (building.health || 0) - damage;
                buildingsDamaged = true;
              }
            } else {
              // Damage Entity
              const targetEntity = entities.find((e) => e._id === target?.id);
              if (targetEntity && !deletedEntityIds.has(targetEntity._id)) {
                targetEntity.health = (targetEntity.health || 1) - damage;
                if (targetEntity.health <= 0) {
                  await ctx.db.delete(targetEntity._id);
                  deletedEntityIds.add(targetEntity._id);

                  // Commander Succession Logic
                  if (
                    targetEntity.type === "commander" &&
                    targetEntity.troopId
                  ) {
                    const troopId = targetEntity.troopId;
                    const possibleHeir = entities.find(
                      (e) =>
                        e.troopId === troopId &&
                        e.type === "soldier" &&
                        !deletedEntityIds.has(e._id) &&
                        e.ownerId === targetEntity.ownerId
                    );

                    if (possibleHeir) {
                      possibleHeir.type = "commander";
                      await ctx.db.patch(possibleHeir._id, {
                        type: "commander",
                      });
                    }
                  }
                } else {
                  await ctx.db.patch(targetEntity._id, {
                    health: targetEntity.health,
                  });
                }
              }
            }
          }
        }
      }
    }

    // Award working credits only on round ticks (every 50 ticks = 5 seconds)
    // AND if the workplace is POWERED
    if (
      entity.state === "working" &&
      entity.ownerId &&
      isRoundTick &&
      entity.workplaceId &&
      poweredBuildingIds.has(entity.workplaceId)
    ) {
      playerCredits[entity.ownerId] =
        (playerCredits[entity.ownerId] || 0) + 1000;
    }

    // Cleanup attack visuals
    if (entity.attackEndTime && now > entity.attackEndTime) {
      entity.attackTargetId = undefined;
      entity.attackEndTime = undefined;
      dirty = true;
    }

    if (dirty && !deletedEntityIds.has(entity._id)) {
      await ctx.db.patch(entity._id, entity);
    }
  }
  return buildingsDamaged;
}
