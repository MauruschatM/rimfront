import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { createCollisionMap, findPath } from "./lib/pathfinding";

// 5x5 Central Base
const BASE_SIZE = 5;

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

            await ctx.scheduler.runAfter(0, internal.game.tick, { gameId: game._id });
        }
    }
});

export const tick = internalMutation({
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

        await ctx.scheduler.runAfter(5000, internal.game.tick, { gameId: args.gameId });
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
