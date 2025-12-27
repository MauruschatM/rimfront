import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { createCollisionMap, findPath } from "./lib/pathfinding";
import { SpatialMap } from "./lib/spatial";

// 5x5 Central Base
const BASE_SIZE = 5;
const GAME_TICK_RATE = 50; // ms

const BUILDINGS: Record<string, { width: number; height: number; cost: number; timePerTile: number }> = {
  house: { width: 2, height: 2, cost: 2000, timePerTile: 2000 },
  workshop: { width: 4, height: 4, cost: 4000, timePerTile: 2000 },
  barracks: { width: 3, height: 3, cost: 4000, timePerTile: 2000 },
};

function calculateBuildingCost(baseCost: number, existingBuildings: any[], playerId: string): number {
  const count = existingBuildings.filter(b => b.ownerId === playerId && b.type !== "base_central").length;
  return baseCost * Math.pow(2, count);
}

// --- Helper: Unit Update Logic ---
// Generic update for any member (Family, Commander, Soldier)
function updateMember(
    member: any,
    now: number,
    mapWidth: number,
    mapHeight: number,
    blocked: Set<string>,
    target?: { x: number, y: number }
): boolean {
    let dirty = false;
    const SPEED_TILES_PER_TICK = 5;

    // 1. Movement along path
    if (member.path && member.path.length > 0) {
        const pathLen = member.path.length;
        const nextIndex = (member.pathIndex || 0) + SPEED_TILES_PER_TICK;

        if (nextIndex >= pathLen - 1) {
            // Arrived
            const finalPos = member.path[pathLen - 1];
            member.x = finalPos.x;
            member.y = finalPos.y;
            member.path = undefined;
            member.pathIndex = undefined;
            member.state = "idle"; // Default to idle on arrival
            dirty = true;
        } else {
            // Still walking
            member.pathIndex = nextIndex;
            const nextPos = member.path[nextIndex];
            member.x = nextPos.x;
            member.y = nextPos.y;
            member.state = "moving";
            dirty = true;
        }
    } else {
        // 2. Idle / AI Logic
        // If we have an explicit target (e.g. Troop movement) and we are not there, pathfind
        if (target && (member.x !== target.x || member.y !== target.y)) {
             const path = findPath({x: member.x, y: member.y}, target, mapWidth, mapHeight, blocked);
             if (path) {
                 member.path = path;
                 member.pathIndex = 0;
                 member.state = "moving";
                 dirty = true;
             }
        }
        else if (member.state === "idle" || member.state === "patrol") {
            // Random Patrol if idle
            if (!member.stateEnd || now > member.stateEnd) {
                // Pick a random nearby point
                const patrolRadius = 3;
                const tx = Math.max(0, Math.min(mapWidth - 1, member.x + Math.floor(Math.random() * (patrolRadius * 2 + 1)) - patrolRadius));
                const ty = Math.max(0, Math.min(mapHeight - 1, member.y + Math.floor(Math.random() * (patrolRadius * 2 + 1)) - patrolRadius));

                // Only move if not blocked
                if (!blocked.has(`${tx},${ty}`)) {
                    const path = findPath({x: member.x, y: member.y}, {x: tx, y: ty}, mapWidth, mapHeight, blocked);
                    if (path) {
                        member.path = path;
                        member.pathIndex = 0;
                        member.state = "patrol";
                        dirty = true;
                    }
                }

                // Set next decision time (random 5-15s)
                member.stateEnd = now + (Math.random() * 10000 + 5000);
            }
        }
    }
    return dirty;
}

export const placeBase = mutation({
  args: {
    gameId: v.id("games"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.phase !== "placement") {
      throw new Error("Not in placement phase");
    }

    const player = await ctx.db
      .query("players")
      .filter((q) => q.and(q.eq(q.field("gameId"), args.gameId), q.eq(q.field("userId"), identity.subject)))
      .first();

    if (!player) throw new Error("Player not found in this game");
    if (player.hasPlacedBase) throw new Error("Base already placed");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    if (args.x < 0 || args.x + BASE_SIZE > map.width || args.y < 0 || args.y + BASE_SIZE > map.height) {
      throw new Error("Out of bounds");
    }

    for (const b of map.buildings) {
        if (
            args.x < b.x + b.width &&
            args.x + BASE_SIZE > b.x &&
            args.y < b.y + b.height &&
            args.y + BASE_SIZE > b.y
        ) {
            throw new Error("Collides with another building");
        }
    }

    const newBuilding = {
        id: Math.random().toString(36).slice(2),
        ownerId: player._id,
        type: "base_central",
        x: args.x,
        y: args.y,
        width: BASE_SIZE,
        height: BASE_SIZE,
        health: 1000
    };

    const newBuildings = [...map.buildings, newBuilding];

    await ctx.db.patch(map._id, {
        buildings: newBuildings
    });

    await ctx.db.patch(player._id, {
        hasPlacedBase: true
    });

    return { success: true, building: newBuilding };
  },
});

export const placeBuilding = mutation({
  args: {
    gameId: v.id("games"),
    buildingType: v.string(), // "house", "workshop", "barracks"
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.phase !== "simulation") {
      throw new Error("Build mode only available in simulation phase");
    }

    const buildingSpec = BUILDINGS[args.buildingType];
    if (!buildingSpec) throw new Error("Invalid building type");

    const player = await ctx.db
      .query("players")
      .filter((q) => q.and(q.eq(q.field("gameId"), args.gameId), q.eq(q.field("userId"), identity.subject)))
      .first();

    if (!player) throw new Error("Player not found");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    const cost = calculateBuildingCost(buildingSpec.cost, map.buildings, player._id);

    if ((player.credits || 0) < cost) {
        throw new Error("Not enough credits");
    }

    if (
        args.x < 0 ||
        args.x + buildingSpec.width > map.width ||
        args.y < 0 ||
        args.y + buildingSpec.height > map.height
    ) {
      throw new Error("Out of bounds");
    }

    for (const b of map.buildings) {
        const noOverlap =
            args.x >= b.x + b.width + 1 ||
            args.x + buildingSpec.width + 1 <= b.x ||
            args.y >= b.y + b.height + 1 ||
            args.y + buildingSpec.height + 1 <= b.y;

        if (!noOverlap) {
            throw new Error("Cannot place here: overlapping or too close to another building");
        }
    }

    await ctx.db.patch(player._id, {
        credits: (player.credits || 0) - cost
    });

    const totalTiles = buildingSpec.width * buildingSpec.height;
    const durationMs = totalTiles * buildingSpec.timePerTile;
    const constructionEnd = Date.now() + durationMs;

    const newBuilding = {
        id: Math.random().toString(36).slice(2),
        ownerId: player._id,
        type: args.buildingType,
        x: args.x,
        y: args.y,
        width: buildingSpec.width,
        height: buildingSpec.height,
        health: 100,
        constructionEnd
    };

    const newBuildings = [...map.buildings, newBuilding];

    await ctx.db.patch(map._id, {
        buildings: newBuildings
    });

    return { success: true, building: newBuilding, cost };
  },
});

export const endPlacementPhase = internalMutation({
    args: {
        gameId: v.id("games")
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) return;

        if (game.phase === "placement") {
            await ctx.db.patch(game._id, {
                phase: "simulation",
                phaseStart: Date.now(),
                phaseEnd: undefined
            });

            // Start both loops
            await ctx.scheduler.runAfter(0, internal.game.round, { gameId: game._id });
            await ctx.scheduler.runAfter(0, internal.game.game_tick, { gameId: game._id });
        }
    }
});

export const game_tick = internalMutation({
    args: {
        gameId: v.id("games")
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || game.status !== "active" || game.phase !== "simulation") return;

        const now = Date.now();
        const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
        if (!mapDoc) return;

        const unitChunks = await ctx.db.query("unit_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();

        // 1. Build Spatial Map
        const spatial = new SpatialMap(mapDoc.width, mapDoc.height);

        // Add Buildings
        for (const b of mapDoc.buildings) {
            spatial.addBuilding(b);
        }

        // Add Units
        for (const chunk of unitChunks) {
             for (const fam of chunk.families) {
                 for (const m of fam.members) {
                     spatial.addUnit({ ...m, type: "resident" });
                 }
             }
             for (const troop of chunk.troops) {
                 spatial.addUnit({ ...troop.commander, type: "commander", ownerId: troop.commander.ownerId });
                 for (const s of troop.soldiers) {
                     spatial.addUnit({ ...s, type: "soldier", ownerId: troop.commander.ownerId });
                 }
             }
        }

        // 2. Process Units (Movement & Combat Prep)
        const SPEED_TILES_PER_TICK = 5 * (GAME_TICK_RATE / 5000); // Normalize speed: 5 tiles per 5s -> ~0.05 per 50ms
        const blocked = createCollisionMap(mapDoc.width, mapDoc.height, mapDoc.buildings);

        let anyChunkDirty = false;
        let mapDirty = false;
        const dirtyChunks = new Set<string>();
        const deadUnitIds = new Set<string>();

        // We process all units.
        // Note: For pure movement, we just interpolate along the path.
        // But we must stop if we are in range of an enemy.

        for (const chunk of unitChunks) {
            let chunkDirty = false;

            // Helper to process a member
            const processMember = (member: any, type: "commander" | "soldier" | "resident") => {
                 // Check for enemies
                 // Soldiers/Commanders can attack units (10 range) or buildings (capture range 2)
                 // If we have a target building, we need to get close (2).
                 // If we have a target unit, we need 10.

                 const isCombatUnit = type === "soldier" || type === "commander";
                 const searchRange = isCombatUnit ? 10 : 0; // Look up to 10 tiles

                 if (searchRange > 0) {
                      const enemy = spatial.findClosestTarget(member.x, member.y, searchRange, member.ownerId);

                      if (enemy) {
                          // Determine required range based on target type
                          const requiredRange = enemy.type === "building" ? 2 : 10;

                          // Are we in range?
                          if (enemy.dist <= requiredRange) {
                              // Combat / Capture
                              member.state = "attacking"; // Visual state
                              member.targetId = enemy.target.id;
                              member.targetPos = { x: enemy.target.x, y: enemy.target.y }; // For visuals

                              if (enemy.type === "unit") {
                                  // Attack Logic (High probability hit)
                                  if (Math.random() < 0.9) {
                                      // Mark as dead using ID
                                      deadUnitIds.add(enemy.target.id);
                                      member.lastShot = Date.now();
                                  }
                              } else if (enemy.type === "building") {
                                  // Capture Logic
                                  // We are in range (2) of a building
                                  // We handle capture update later or here?
                                  // Let's do it here since we have the reference.
                                  // But we need the mapDoc reference, not the copy in SpatialMap.
                                  const realBuilding = mapDoc.buildings.find(mb => mb.id === enemy.target.id);
                                  if (realBuilding && realBuilding.ownerId !== member.ownerId) {
                                      realBuilding.captureProgress = (realBuilding.captureProgress || 0) + (GAME_TICK_RATE / 1000);
                                      if (realBuilding.captureProgress >= 5) {
                                          realBuilding.ownerId = member.ownerId;
                                          realBuilding.captureProgress = 0;
                                          mapDirty = true;
                                      } else {
                                          mapDirty = true;
                                      }
                                  }
                              }
                              return; // Stop processing movement
                          }
                          // Else: We see an enemy but are out of range?
                          // The `searchRange` (10) covers unit attack range.
                          // If target is building, we see it at 10 but need to go to 2.
                          // We should continue moving if we have a path, OR path to it?
                          // "Troops attack... closest..."
                          // If we are at 9 tiles from building, we should move closer.
                          // But pathfinding is heavy.
                          // For now, if we have a path, continue. If idle, we might need to path.
                          // Requirement says "Automatically attack".
                          // If we are idle and see an enemy out of range (but within 10?), we should move?
                          // Wait, if building is at 9, `enemy.dist` is 9. `requiredRange` is 2.
                          // We continue to `if (member.path...)`.
                      }
                 }


                 // If not attacking, move
                 if (member.path && member.path.length > 0) {
                    const pathLen = member.path.length;
                    // Current fractional index
                    let nextIndex = (member.pathIndex || 0) + SPEED_TILES_PER_TICK;

                    if (nextIndex >= pathLen - 1) {
                         // Arrived
                        const finalPos = member.path[pathLen - 1];
                        member.x = finalPos.x;
                        member.y = finalPos.y;
                        member.path = undefined;
                        member.pathIndex = undefined;
                        member.state = "idle";
                    } else {
                        member.pathIndex = nextIndex;
                        // Interpolate
                        const idxFloor = Math.floor(nextIndex);
                        const idxCeil = Math.min(idxFloor + 1, pathLen - 1);
                        const t = nextIndex - idxFloor;

                        const p1 = member.path[idxFloor];
                        const p2 = member.path[idxCeil];

                        member.x = p1.x + (p2.x - p1.x) * t;
                        member.y = p1.y + (p2.y - p1.y) * t;
                        member.state = "moving";
                    }
                 }
            };

            for (const troop of chunk.troops) {
                processMember(troop.commander, "commander");
                for (const s of troop.soldiers) processMember(s, "soldier");

                // Filter out dead soldiers
                const originalCount = troop.soldiers.length;
                troop.soldiers = troop.soldiers.filter((s: any) => !deadUnitIds.has(s.id));
                if (troop.soldiers.length !== originalCount) chunkDirty = true;

                // Check Commander Death
                if (deadUnitIds.has(troop.commander.id)) {
                    // Mark troop for removal
                    // We can't set property on troop easily to filter later in this loop structure without another pass or mutable flag.
                    // Let's add troop ID to a "deadTroops" set or just filter it out next.
                    // Easier: Mark it here.
                    (troop as any)._dead = true;
                    chunkDirty = true;
                }
            }

             // Filter dead troops
             const originalTroopCount = chunk.troops.length;
             chunk.troops = chunk.troops.filter((t: any) => !t._dead);
             if (chunk.troops.length !== originalTroopCount) chunkDirty = true;

             for (const fam of chunk.families) {
                 for (const m of fam.members) processMember(m, "resident");

                 // Filter dead members
                 const originalMemCount = fam.members.length;
                 fam.members = fam.members.filter((m: any) => !deadUnitIds.has(m.id));
                 if (fam.members.length !== originalMemCount) chunkDirty = true;

                 // We assume families don't "die" as a group, just members.
             }

            if (chunkDirty) {
                dirtyChunks.add(chunk._id);
            }
        }

        // Save dirty chunks
        for (const chunk of unitChunks) {
            if (dirtyChunks.has(chunk._id)) {
                 await ctx.db.patch(chunk._id, {
                    families: chunk.families,
                    troops: chunk.troops
                });
            }
        }

        // Save Map (Buildings)
        if (mapDirty) {
            await ctx.db.patch(mapDoc._id, { buildings: mapDoc.buildings });

            // Check Win Condition
            const bases = mapDoc.buildings.filter(b => b.type === "base_central");
            const owners = new Set(bases.map(b => b.ownerId));

            if (owners.size === 1 && bases.length > 0) {
                // Winner!
                const winnerId = owners.values().next().value;
                await ctx.db.patch(args.gameId, { status: "ended" });
                // Schedule deletion
                await ctx.scheduler.runAfter(10000, api.game.deleteGame, { gameId: args.gameId });
                return; // Stop loop
            }
        }

        await ctx.scheduler.runAfter(GAME_TICK_RATE, internal.game.game_tick, { gameId: args.gameId });
    }
});

export const round = internalMutation({
    args: {
        gameId: v.id("games")
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || game.status !== "active" || game.phase !== "simulation") return;

        const now = Date.now();

        // 1. Load Data
        const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
        if (!mapDoc) return;

        const unitChunks = await ctx.db.query("unit_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();

        const playerCredits: Record<string, number> = {};
        for (const p of players) playerCredits[p._id] = 0;

        // 2. Prepare Collision Map
        const blocked = createCollisionMap(mapDoc.width, mapDoc.height, mapDoc.buildings);

        // Categorize buildings
        const houses: any[] = [];
        const workshops: any[] = [];
        const barracks: any[] = [];

        for (const b of mapDoc.buildings) {
            if (b.type === "house") houses.push(b);
            if (b.type === "workshop") workshops.push(b);
            if (b.type === "barracks") barracks.push(b);
        }

        // 3. Process Chunks (Movement & Logic)
        const knownFamilies: Set<string> = new Set();
        const knownTroops: Set<string> = new Set(); // by barracksId

        for (const chunk of unitChunks) {
            let chunkDirty = false;

            // --- Process Families ---
            for (const family of chunk.families) {
                knownFamilies.add(family.homeId);
                for (const member of family.members) {
                    if (updateMember(member, now, mapDoc.width, mapDoc.height, blocked)) {
                        chunkDirty = true;
                    }
                    // Economy Logic (Work) - simplified for now
                    if (member.state === "working") {
                         if (member.ownerId) playerCredits[member.ownerId] = (playerCredits[member.ownerId] || 0) + 1000;
                    }
                }
            }

            // --- Process Troops ---
            for (const troop of chunk.troops) {
                knownTroops.add(troop.barracksId);
                // Update Commander
                if (updateMember(troop.commander, now, mapDoc.width, mapDoc.height, blocked, troop.targetPos)) {
                    chunkDirty = true;
                }
                // Update Soldiers
                for (const soldier of troop.soldiers) {
                    if (updateMember(soldier, now, mapDoc.width, mapDoc.height, blocked, troop.targetPos)) {
                        chunkDirty = true;
                    }
                }

                // Spawning Logic (Soldiers)
                if (troop.soldiers.length < 10) { // Max 10 soldiers
                     const lastSpawn = troop.lastSpawnTime || 0;
                     // Random 10-30s -> 10000 - 30000ms
                     const nextSpawnDelay = 10000 + Math.random() * 20000;
                     if (now > lastSpawn + nextSpawnDelay) {
                         troop.soldiers.push({
                             id: Math.random().toString(36).slice(2),
                             ownerId: troop.commander.ownerId,
                             state: "idle",
                             x: troop.commander.x, // Spawn near commander/barracks
                             y: troop.commander.y,
                         });
                         troop.lastSpawnTime = now;
                         chunkDirty = true;
                     }
                }
            }

            if (chunkDirty) {
                await ctx.db.patch(chunk._id, {
                    families: chunk.families,
                    troops: chunk.troops
                });
            }
        }

        // 4. Spawn New Groups (Families / Troops) if buildings exist but groups don't
        // We need to find or create a chunk with space.

        let targetChunk = unitChunks[unitChunks.length - 1];
        if (!targetChunk) {
            // Need to create first chunk if none exists (unlikely if loop ran, but possible if empty)
             const id = await ctx.db.insert("unit_chunks", {
                 gameId: args.gameId,
                 chunkIndex: 0,
                 families: [],
                 troops: []
             });
             targetChunk = await ctx.db.get(id) as any;
        }

        // --- Spawn Troops (Barracks) ---
        for (const b of barracks) {
            if (b.constructionEnd && now < b.constructionEnd) continue;
            if (knownTroops.has(b.id)) continue;

            // Spawn new Troop
            const commander = {
                id: Math.random().toString(36).slice(2),
                ownerId: b.ownerId,
                state: "idle",
                x: b.x + 1,
                y: b.y + 1,
            };

            const newTroop = {
                id: Math.random().toString(36).slice(2),
                barracksId: b.id,
                commander,
                soldiers: [],
                lastSpawnTime: now,
                state: "idle"
            };

            // Add to chunk
            targetChunk.troops.push(newTroop);
            await ctx.db.patch(targetChunk._id, { troops: targetChunk.troops });
            knownTroops.add(b.id);
        }

        // --- Spawn Families (Houses) ---
        for (const h of houses) {
            if (h.constructionEnd && now < h.constructionEnd) continue;

            // Check if family exists
            // Optimization: We iterate all chunks earlier. If we have many chunks, this linear scan per house is O(N*M).
            // But usually N (houses) is small relative to chunks?
            // "knownFamilies" set handles existence check.

            if (!knownFamilies.has(h.id)) {
                // Create Family
                const newFamily = {
                    id: Math.random().toString(36).slice(2),
                    homeId: h.id,
                    members: []
                };
                targetChunk.families.push(newFamily);
                await ctx.db.patch(targetChunk._id, { families: targetChunk.families });
                knownFamilies.add(h.id);
            }
        }

        // Re-iterate chunks to spawn family members? Or do it in the first pass?
        // Let's do a quick fix: If a family has < 4 members, spawn one.
        // I should have done this in step 3.
        // I will add a specific pass for family population growth now.

        for (const chunk of unitChunks) {
            let dirty = false;
            for (const fam of chunk.families) {
                if (fam.members.length < 4) {
                    if (Math.random() < 0.2) { // Chance to spawn
                        // Find home location
                        const home = houses.find(h => h.id === fam.homeId);
                        if (home) {
                             fam.members.push({
                                 id: Math.random().toString(36).slice(2),
                                 ownerId: home.ownerId,
                                 homeId: home.id,
                                 state: "idle",
                                 x: home.x,
                                 y: home.y
                             });
                             dirty = true;
                        }
                    }
                }
            }
            if (dirty) await ctx.db.patch(chunk._id, { families: chunk.families });
        }


        // 5. Update Credits
        for (const p of players) {
            const gain = (playerCredits[p._id] || 0);
            if (gain > 0) {
                 await ctx.db.patch(p._id, {
                    credits: (p.credits || 0) + gain
                });
            }
        }

        await ctx.scheduler.runAfter(5000, internal.game.round, { gameId: args.gameId });
    }
});

export const deleteGame = mutation({
    args: {
        gameId: v.id("games")
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) return;

        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();
        for (const p of players) await ctx.db.delete(p._id);

        const teams = await ctx.db.query("teams").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();
        for (const t of teams) await ctx.db.delete(t._id);

        const maps = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        for (const m of maps) await ctx.db.delete(m._id);

        const chunks = await ctx.db.query("unit_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        for (const c of chunks) await ctx.db.delete(c._id);

        await ctx.db.delete(game._id);
    }
});

export const getGameState = query({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game) return null;

        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();

        let buildings: any[] = [];
        let planetType = "";
        let unitChunks: any[] = [];

        if (game.phase !== "lobby") {
             const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
             if (mapDoc) {
                 buildings = mapDoc.buildings;
                 planetType = mapDoc.planetType;
             }
             unitChunks = await ctx.db.query("unit_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        }

        return {
            game,
            players,
            buildings,
            planetType,
            unitChunks
        };
    }
});

export const getStaticMap = query({
    args: { gameId: v.id("games") },
    handler: async (ctx, args) => {
        const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
        if (!mapDoc) return null;

        return {
            _id: mapDoc._id,
            width: mapDoc.width,
            height: mapDoc.height,
            planetType: mapDoc.planetType,
            tiles: mapDoc.tiles,
            structures: mapDoc.structures
        };
    }
});

export const moveTroop = mutation({
    args: {
        gameId: v.id("games"),
        troopId: v.string(),
        targetX: v.number(),
        targetY: v.number()
    },
    handler: async (ctx, args) => {
        const identity = await ctx.auth.getUserIdentity();
        if (!identity) throw new Error("Unauthorized");

        // Find the troop
        const unitChunks = await ctx.db.query("unit_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();

        let foundChunk = null;
        let foundTroop = null;

        for (const chunk of unitChunks) {
            const troop = chunk.troops.find(t => t.id === args.troopId);
            if (troop) {
                foundTroop = troop;
                foundChunk = chunk;
                break;
            }
        }

        if (!foundTroop || !foundChunk) throw new Error("Troop not found");

        // Check ownership
        const player = await ctx.db.query("players").filter(q => q.and(q.eq(q.field("gameId"), args.gameId), q.eq(q.field("userId"), identity.subject))).first();
        if (!player) throw new Error("Player not found");

        // Assuming commander ownerId matches player
        if (foundTroop.commander.ownerId !== player._id) throw new Error("Not your troop");

        // Update Target
        foundTroop.targetPos = { x: args.targetX, y: args.targetY };
        foundTroop.state = "moving"; // Force state update

        // Reset members to ensure they pathfind
        foundTroop.commander.state = "idle";
        for(const s of foundTroop.soldiers) s.state = "idle";

        await ctx.db.patch(foundChunk._id, { troops: foundChunk.troops });
    }
});
