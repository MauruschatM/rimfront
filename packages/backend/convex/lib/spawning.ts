import type { Id } from "../_generated/dataModel";
import { SPAWN_INTERVAL_MS } from "./constants";
import type { Building, Entity, Family, Troop } from "./types";

export async function handleSpawning(
  ctx: any,
  gameId: Id<"games">,
  now: number,
  houses: Building[],
  barracks: Building[],
  families: Family[],
  troops: Troop[],
  entities: Entity[],
  poweredBuildingIds: Set<string>
) {
  const knownFamilies = new Set(families.map((f) => f.homeId));
  const knownTroops = new Set(troops.map((t) => t.barracksId));

  // Helper to check if building is being captured
  const isBeingCaptured = (building: Building) =>
    building.captureStart !== undefined &&
    building.capturingOwnerId !== undefined;

  for (const b of barracks) {
    if (
      (b.constructionEnd && now < b.constructionEnd) ||
      knownTroops.has(b.id)
    ) {
      continue;
    }

    // Only spawn group if barracks is powered
    if (!poweredBuildingIds.has(b.id)) {
      continue;
    }

    const troopId = await ctx.db.insert("troops", {
      gameId,
      barracksId: b.id,
      ownerId: b.ownerId,
      state: "idle",
      targetPos: {
        x: b.x + Math.floor(b.width / 2),
        y: b.y + Math.floor(b.height / 2),
      },
      lastSpawnTime: now, // Initialize spawn timer
    });

    await ctx.db.insert("entities", {
      gameId,
      ownerId: b.ownerId,
      troopId,
      type: "commander",
      state: "idle",
      x: b.x + 1,
      y: b.y + b.height, // Spawn outside the front
      isInside: false,
    });
    knownTroops.add(b.id);
  }

  for (const h of houses) {
    if (h.constructionEnd && now < h.constructionEnd) {
      continue;
    }
    // Only spawn family if house is powered
    if (!poweredBuildingIds.has(h.id)) {
      continue;
    }

    if (!knownFamilies.has(h.id)) {
      await ctx.db.insert("families", {
        gameId,
        homeId: h.id,
        ownerId: h.ownerId,
        lastSpawnTime: now, // Initialize spawn timer
      });
      knownFamilies.add(h.id);
    }
  }

  // Refresh data for growth logic
  const troopsUpdated = (await ctx.db
    .query("troops")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Troop[];
  const familiesUpdated = (await ctx.db
    .query("families")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Family[];

  for (const fam of familiesUpdated) {
    // Check if home is powered
    if (!poweredBuildingIds.has(fam.homeId)) {
      continue;
    }

    // Skip if home is being captured
    const home = houses.find((h) => h.id === fam.homeId);
    if (home && isBeingCaptured(home)) {
      continue;
    }

    const memberCount = entities.filter((e) => e.familyId === fam._id).length;
    // Only spawn if under capacity AND 30 seconds have passed
    if (memberCount < 4) {
      const lastSpawn = fam.lastSpawnTime || 0;
      if (now > lastSpawn + SPAWN_INTERVAL_MS) {
        const home = houses.find((h) => h.id === fam.homeId);
        if (home) {
          await ctx.db.insert("entities", {
            gameId,
            ownerId: home.ownerId,
            familyId: fam._id,
            homeId: home.id,
            type: "member",
            state: "idle",
            x: home.x,
            y: home.y,
            isInside: false,
          });
          await ctx.db.patch(fam._id, { lastSpawnTime: now });
        }
      }
    }
  }

  for (const troop of troopsUpdated) {
    // Check if barracks is powered
    if (!poweredBuildingIds.has(troop.barracksId)) {
      continue;
    }

    // Skip if barracks is being captured
    const barracksBuilding = barracks.find((b) => b.id === troop.barracksId);
    if (barracksBuilding && isBeingCaptured(barracksBuilding)) {
      continue;
    }

    const commander = entities.find(
      (e) => e.troopId === troop._id && e.type === "commander"
    );

    // Only spawn soldiers if under capacity AND 30 seconds have passed
    // Limit total troop members (soldiers + commander) to 4
    if (
      commander &&
      entities.filter((e) => e.troopId === troop._id).length < 4
    ) {
      const lastSpawn = troop.lastSpawnTime || 0;
      if (now > lastSpawn + SPAWN_INTERVAL_MS) {
        const offset = {
          x: (Math.random() - 0.5) * 1,
          y: Math.random() * 1,
        };
        const barracksObj = barracks.find((b) => b.id === troop.barracksId);
        const spawnX = barracksObj ? barracksObj.x + 1 : commander.x;
        const spawnY = barracksObj
          ? barracksObj.y + barracksObj.height
          : commander.y;

        const newSoldier = {
          gameId,
          ownerId: troop.ownerId,
          troopId: troop._id,
          type: "soldier",
          state: "idle",
          x: spawnX + offset.x,
          y: spawnY + offset.y,
          isInside: false,
          health: 10,
        };
        await ctx.db.insert("entities", newSoldier);
        entities.push(newSoldier as any); // Update local array to prevent logic delay
        await ctx.db.patch(troop._id, { lastSpawnTime: now });
      }
    }
  }
}
