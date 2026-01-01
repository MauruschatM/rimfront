import type { Id } from "../_generated/dataModel";
import { processActiveEntities } from "./combat";
import { TICKS_PER_ROUND } from "./constants";
import { calculatePoweredBuildings, handleCapture, transferOwnership } from "./gameState";
import { eliminatePlayer } from "./player";
import { handleSpawning } from "./spawning";
import { SpatialHash } from "./spatial";
import type { Building, Entity, Family, Player, Troop } from "./types";
import { categorizeBuildings, processInsideEntities } from "./unitBehavior";
import { createCollisionMap } from "./pathfinding";

export async function runGameTick(ctx: any, gameId: Id<"games">) {
  const game = await ctx.db.get(gameId);
  if (!game || game.status !== "active" || game.phase !== "simulation") {
    return;
  }

  const now = Date.now();

  // Track tick count for round-based economy
  const tickCount = (game.tickCount || 0) + 1;
  const isRoundTick = tickCount % TICKS_PER_ROUND === 0;
  await ctx.db.patch(game._id, { tickCount });

  // 1.0 Inflation Decay (every round, reduce by 0.1 down to min 1.0)
  if (isRoundTick) {
    const players = await ctx.db
      .query("players")
      .filter((q: any) => q.eq(q.field("gameId"), gameId))
      .collect();

    for (const player of players) {
      const currentInflation = player.inflation || 1.0;
      if (currentInflation > 1.0) {
        const newInflation = Math.max(1.0, currentInflation - 0.1);
        await ctx.db.patch(player._id, { inflation: newInflation });
      }
    }
  }

  // 1. Timer & End Game Check
  if (game.phaseEnd && game.phaseEnd !== undefined && now > game.phaseEnd) {
    await ctx.db.patch(game._id, { status: "ended" });
    return;
  }

  // 1.1 Victory Check (Auto-End if 1 player left)
  // Only check if game is active
  if (game.status === "active" && game.phase === "simulation") {
    const allPlayers = await ctx.db
      .query("players")
      .filter((q: any) => q.eq(q.field("gameId"), gameId))
      .collect();
    const activePlayers = allPlayers.filter(
      (p: any) => !p.status || p.status === "active"
    );

    // Group by Team
    const activeTeams = new Set<string>();
    let independentPlayerCount = 0;

    for (const p of activePlayers) {
      if (p.teamId) {
        activeTeams.add(p.teamId);
      } else {
        independentPlayerCount++;
      }
    }

    // Total competing factions = teams + independent players
    const totalFactions = activeTeams.size + independentPlayerCount;

    if (totalFactions <= 1 && allPlayers.length > 1) {
      // Ensure >1 total players so solo testing doesn't instant-end
      await ctx.db.patch(game._id, { status: "ended" });
      return;
    }
  }

  const mapDoc = await ctx.db
    .query("maps")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .first();
  if (!mapDoc) {
    return;
  }

  const entities = (await ctx.db
    .query("entities")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Entity[];

  // 2. Capture Logic
  const captureEvents = handleCapture(mapDoc.buildings, entities, now);

  // 2.1 Destruction Logic (Cleanup destroyed buildings)
  // We filter out buildings with health <= 0
  // And delete associated entities (e.g. turret guns)
  const survivors: Building[] = [];
  const destroyedBuildingIds = new Set<string>();

  for (const b of mapDoc.buildings) {
    if (
      b.health !== undefined &&
      b.health <= 0 &&
      b.type !== "base_central"
    ) {
      destroyedBuildingIds.add(b.id);
    } else {
      survivors.push(b);
    }
  }

  if (destroyedBuildingIds.size > 0) {
    // Cleanup associated entities
    for (const id of destroyedBuildingIds) {
      // Find entities linked to this building
      const linkedEntities = entities.filter((e) => e.buildingId === id);
      for (const e of linkedEntities) {
        await ctx.db.delete(e._id);
      }
    }

    // Update Map with survivors
    mapDoc.buildings = survivors;
    await ctx.db.patch(mapDoc._id, { buildings: survivors });
  }

  // Save map if capture events occurred OR if health changed (we can't easily track health change dirty flag,
  // but we can check if we saved above. If destroyed, we saved.
  // If not destroyed but damaged? We need to save.
  const mapSaved = destroyedBuildingIds.size > 0;

  if (!mapSaved) {
    if (captureEvents.length > 0) {
      await ctx.db.patch(mapDoc._id, { buildings: mapDoc.buildings });
    }
  }

  // Process Completed Captures
  const pendingEliminations: {
    victimId: Id<"players">;
    conquerorId: Id<"players">;
  }[] = [];

  for (const event of captureEvents) {
    if (event.isBase) {
      // Base Captured -> Elimination
      pendingEliminations.push({
        victimId: event.victimId as Id<"players">,
        conquerorId: event.conquerorId as Id<"players">,
      });
    } else {
      // Normal Building Captured -> Transfer Ownership
      const b = mapDoc.buildings.find((b: any) => b.id === event.buildingId);
      if (b) {
        b.ownerId = event.conquerorId;
        // Reset capture state (already done in handleCapture, but good for safety)
        b.captureStart = undefined;
        b.capturingOwnerId = undefined;

        // Transfer Linked Units/Groups
        await transferOwnership(
          ctx,
          gameId,
          event.buildingId,
          event.conquerorId as Id<"players">
        );
      }
    }
  }

  // Save map again if we modified owners above
  if (captureEvents.length > 0) {
    await ctx.db.patch(mapDoc._id, { buildings: mapDoc.buildings });
  }

  const players = (await ctx.db
    .query("players")
    .filter((q: any) => q.eq(q.field("gameId"), gameId))
    .collect()) as Player[];
  const families = (await ctx.db
    .query("families")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Family[];
  const troops = (await ctx.db
    .query("troops")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Troop[];

  const playerCredits: Record<string, number> = {};
  for (const p of players) {
    playerCredits[p._id] = 0;
  }

  const blocked = createCollisionMap(
    mapDoc.width,
    mapDoc.height,
    mapDoc.buildings
  );
  const { houses, workshops, barracks, turrets, walls } = categorizeBuildings(
    mapDoc.buildings
  );

  // 2.1 Power Grid Logic
  const poweredBuildingIds = calculatePoweredBuildings(mapDoc.buildings);

  // Build Spatial Hash
  const spatialHash = new SpatialHash(10); // 10x10 chunks
  for (const e of entities) {
    if (!e.isInside && e.type !== "turret_gun") {
      spatialHash.insert(e.type, e._id, e.x, e.y, e.ownerId);
    }
  }
  // Add buildings to hash
  for (const b of mapDoc.buildings) {
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    spatialHash.insert("building", b.id, cx, cy, b.ownerId);
  }

  // Spawn Turret Guns
  for (const t of turrets) {
    // Check if finished construction
    if (t.constructionEnd && now < t.constructionEnd) continue;

    // Check if "turret_gun" entity exists
    const existingGun = entities.find(
      (e) => e.type === "turret_gun" && e.buildingId === t.id
    );
    if (!existingGun) {
      // Spawn it
      const newEntity = {
        gameId: gameId,
        ownerId: t.ownerId as Id<"players">,
        buildingId: t.id,
        type: "turret_gun",
        state: "idle",
        x: t.x + t.width / 2,
        y: t.y + t.height / 2,
        isInside: false,
      };
      await ctx.db.insert("entities", newEntity);
      entities.push(newEntity as any);
    }
  }

  // Fetch Alliances & Handle Expiration
  const allianceDocs = await ctx.db
    .query("diplomacy")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();
  const alliances = new Set<string>();
  const expiredAllianceIds = new Set<string>();

  for (const d of allianceDocs) {
    if (d.status === "allied") {
      if (d.expiresAt && now > d.expiresAt) {
        expiredAllianceIds.add(d._id);
        continue;
      }
      // Store as sorted pair to easily check "a:b" or "b:a"
      const p1 = d.player1Id < d.player2Id ? d.player1Id : d.player2Id;
      const p2 = d.player1Id < d.player2Id ? d.player2Id : d.player1Id;
      alliances.add(`${p1}:${p2}`);
    }
  }

  // Delete expired alliances (silent break)
  for (const id of expiredAllianceIds) {
    await ctx.db.delete(id as any);
  }

  const playerBetrayalTimes: Record<string, number> = {};
  const playerTeams: Record<string, string> = {};
  for (const p of players) {
    if (p.lastBetrayalTime) {
      playerBetrayalTimes[p._id] = p.lastBetrayalTime;
    }
    if (p.teamId) {
      playerTeams[p._id] = p.teamId;
    }
  }

  const buildingsDamaged = await processActiveEntities(
    ctx,
    entities.filter((e) => !e.isInside),
    troops,
    now,
    mapDoc.width,
    mapDoc.height,
    blocked,
    workshops,
    houses,
    barracks,
    turrets,
    walls,
    playerCredits,
    spatialHash,
    entities,
    isRoundTick,
    poweredBuildingIds,
    playerBetrayalTimes,
    alliances,
    playerTeams
  );
  await processInsideEntities(
    ctx,
    entities.filter((e) => e.isInside),
    now,
    workshops,
    houses,
    playerCredits,
    isRoundTick,
    poweredBuildingIds
  );
  await handleSpawning(
    ctx,
    gameId,
    now,
    houses,
    barracks,
    families,
    troops,
    entities,
    poweredBuildingIds
  );

  for (const p of players) {
    const gain = playerCredits[p._id] || 0;
    if (gain > 0) {
      await ctx.db.patch(p._id, { credits: (p.credits || 0) + gain });
    }
  }

  // Execute Pending Eliminations
  for (const elim of pendingEliminations) {
    await eliminatePlayer(ctx, gameId, elim.victimId, elim.conquerorId);
  }

  // Post-processing: Cleanup destroyed buildings (health <= 0)
  // Runs after damage logic
  const finalSurvivors: Building[] = [];
  const finalDestroyedIds = new Set<string>();
  let buildingCountChanged = false;

  for (const b of mapDoc.buildings) {
    if (
      b.health !== undefined &&
      b.health <= 0 &&
      b.type !== "base_central"
    ) {
      finalDestroyedIds.add(b.id);
      buildingCountChanged = true;
    } else {
      finalSurvivors.push(b);
    }
  }

  if (buildingCountChanged) {
    // Cleanup entities linked to destroyed buildings
    for (const id of finalDestroyedIds) {
      const linked = entities.filter((e) => e.buildingId === id);
      for (const e of linked) {
        await ctx.db.delete(e._id);
      }
    }
    // Save new building list (also saves any health changes for survivors if we use this list)
    await ctx.db.patch(mapDoc._id, { buildings: finalSurvivors });
  } else if (buildingsDamaged && !mapSaved) {
    // If no building died but some were damaged (and not saved by capture/destruction earlier)
    // We need to save the health changes
    await ctx.db.patch(mapDoc._id, { buildings: mapDoc.buildings });
  }
}
