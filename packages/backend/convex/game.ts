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

    // Find player record
    const player = await ctx.db
      .query("players")
      .filter((q) => q.and(q.eq(q.field("gameId"), args.gameId), q.eq(q.field("userId"), identity.subject)))
      .first();

    if (!player) throw new Error("Player not found in this game");
    if (player.hasPlacedBase) throw new Error("Base already placed");

    // Fetch Map
    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    // Check Bounds
    if (args.x < 0 || args.x + BASE_SIZE > map.width || args.y < 0 || args.y + BASE_SIZE > map.height) {
      throw new Error("Out of bounds");
    }

    // Check collision with other buildings
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

    // Add Building
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

    // Find player record
    const player = await ctx.db
      .query("players")
      .filter((q) => q.and(q.eq(q.field("gameId"), args.gameId), q.eq(q.field("userId"), identity.subject)))
      .first();

    if (!player) throw new Error("Player not found");

    // Fetch Map
    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    // Calculate Cost with Inflation
    const cost = calculateBuildingCost(buildingSpec.cost, map.buildings, player._id);

    if ((player.credits || 0) < cost) {
        throw new Error("Not enough credits");
    }

    // Check Bounds
    if (
        args.x < 0 ||
        args.x + buildingSpec.width > map.width ||
        args.y < 0 ||
        args.y + buildingSpec.height > map.height
    ) {
      throw new Error("Out of bounds");
    }

    // Check collision with 1-tile buffer
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

    // Deduct credits
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

// Helper: Get random neighbor tile
function getRandomNeighbor(x: number, y: number, width: number, height: number, blocked: Set<string>): { x: number, y: number } | null {
    const neighbors = [
        { x: x + 1, y: y }, { x: x - 1, y: y }, { x: x, y: y + 1 }, { x: x, y: y - 1 }
    ];
    // Shuffle
    for (let i = neighbors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }

    for (const n of neighbors) {
        if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height && !blocked.has(`${n.x},${n.y}`)) {
            return n;
        }
    }
    return null;
}

export const tick = internalMutation({
    args: {
        gameId: v.id("games")
    },
    handler: async (ctx, args) => {
        const game = await ctx.db.get(args.gameId);
        if (!game || game.status !== "active" || game.phase !== "simulation") return;

        const now = Date.now();
        const RESIDENT_SPEED = 2; // Tiles per tick (5 seconds) -> Very slow walk.
        // User asked for "realistic".
        // If 5s tick, 2 tiles = 0.4 tiles/sec. Normal walking is faster?
        // Let's assume 1 tile = 1 meter. 5 seconds -> 5 meters. So Speed 5 is more realistic (1m/s).
        const SPEED_TILES_PER_TICK = 5;

        // 1. Load Data
        const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
        if (!mapDoc) return;

        // Load chunks
        const residentChunks = await ctx.db.query("resident_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();

        // Load players for credit updates
        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();
        const playerCredits: Record<string, number> = {};
        for (const p of players) playerCredits[p._id] = 0; // Delta

        // 2. Prepare Collision Map
        const blocked = createCollisionMap(mapDoc.width, mapDoc.height, mapDoc.buildings);

        // Map buildings for fast lookup
        const buildingsById: Record<string, any> = {};
        const houses: any[] = [];
        const workshops: any[] = [];

        for (const b of mapDoc.buildings) {
            buildingsById[b.id] = b;
            if (b.type === "house") houses.push(b);
            if (b.type === "workshop") workshops.push(b);
        }

        // Workshop Occupancy Counter (for UI and Logic)
        const workshopOccupancy: Record<string, number> = {};
        for (const w of workshops) workshopOccupancy[w.id] = 0;

        // 3. Process Residents
        // We will collect updates. To avoid updating every chunk if nothing changed, track dirtiness.

        let totalResidents = 0;

        for (const chunk of residentChunks) {
            let chunkDirty = false;
            for (const r of chunk.residents) {
                totalResidents++;

                // Track Workshop Occupancy (if working or commuting to work?)
                // Usually occupancy counts only when they are THERE.
                // But to prevent 100 people walking to same slot, we might reserve?
                // For now, count only if state is 'working'.
                if (r.state === "working" && r.workplaceId) {
                    workshopOccupancy[r.workplaceId] = (workshopOccupancy[r.workplaceId] || 0) + 1;

                    // Economy: Work generates credits
                    if (r.ownerId) {
                         playerCredits[r.ownerId] = (playerCredits[r.ownerId] || 0) + 1000;
                    }
                }

                // --- State Machine ---

                // MOVEMENT ALONG PATH
                if (r.path && r.path.length > 0) {
                     const pathLen = r.path.length;
                     let nextIndex = (r.pathIndex || 0) + SPEED_TILES_PER_TICK;

                     if (nextIndex >= pathLen - 1) {
                         // Arrived
                         const finalPos = r.path[pathLen - 1];
                         r.x = finalPos.x;
                         r.y = finalPos.y;
                         r.path = undefined;
                         r.pathIndex = undefined;

                         // State Transition on Arrival
                         if (r.state === "commute_work") {
                             r.state = "working";
                             r.stateEnd = now + (Math.random() * 30000 + 30000); // 30-60s
                         } else if (r.state === "commute_home") {
                             r.state = "sleeping";
                             r.stateEnd = now + (Math.random() * 20000 + 10000); // 10-30s
                         }
                         chunkDirty = true;
                     } else {
                         // Still walking
                         r.pathIndex = nextIndex;
                         const nextPos = r.path[nextIndex]; // Teleport to next step roughly
                         // Interpolation happens on client. Server stores strict tile.
                         r.x = nextPos.x;
                         r.y = nextPos.y;
                         chunkDirty = true;
                     }
                }
                else {
                    // NO PATH (Idle, Working, Sleeping)

                    if (r.state === "sleeping") {
                        if (r.stateEnd && now > r.stateEnd) {
                            r.state = "idle";
                            chunkDirty = true;
                        }
                    }
                    else if (r.state === "working") {
                        if (r.stateEnd && now > r.stateEnd) {
                            // Go Home
                            const home = buildingsById[r.homeId];
                            if (home) {
                                // Calculate Path
                                const path = findPath({x: r.x, y: r.y}, {x: home.x, y: home.y}, mapDoc.width, mapDoc.height, blocked);
                                if (path) {
                                    r.state = "commute_home";
                                    r.path = path;
                                    r.pathIndex = 0;
                                    chunkDirty = true;
                                }
                            } else {
                                // Home destroyed? Idle.
                                r.state = "idle";
                                chunkDirty = true;
                            }
                        }
                    }
                    else if (r.state === "idle") {
                         // Chance to Work
                         // Find a job if we don't have a workplace or just go to it?
                         // "Seek automatically the next workshop"

                         // 1. Try to find a workshop with space
                         // Heuristic: Find nearest workshop with occupancy < 16
                         let targetWorkshop: any = null;
                         let minDist = Infinity;

                         // Iterate workshops (filter by owner?) - Residents usually work for owner
                         const myWorkshops = workshops.filter(w => w.ownerId === r.ownerId);

                         for (const w of myWorkshops) {
                             const currentOcc = workshopOccupancy[w.id] || 0;
                             if (currentOcc < 16) {
                                 const dist = Math.abs(w.x - r.x) + Math.abs(w.y - r.y);
                                 if (dist < minDist) {
                                     minDist = dist;
                                     targetWorkshop = w;
                                 }
                             }
                         }

                         if (targetWorkshop) {
                             // Go to work
                             r.workplaceId = targetWorkshop.id;
                             const path = findPath({x: r.x, y: r.y}, {x: targetWorkshop.x, y: targetWorkshop.y}, mapDoc.width, mapDoc.height, blocked);
                             if (path) {
                                 r.state = "commute_work";
                                 r.path = path;
                                 r.pathIndex = 0;
                                 chunkDirty = true;
                             }
                         } else {
                             // Wander Randomly (Idle Movement)
                             const neighbor = getRandomNeighbor(r.x, r.y, mapDoc.width, mapDoc.height, blocked);
                             if (neighbor) {
                                 r.x = neighbor.x;
                                 r.y = neighbor.y;
                                 chunkDirty = true;
                             }
                         }
                    }
                }
            }

            if (chunkDirty) {
                await ctx.db.patch(chunk._id, { residents: chunk.residents });
            }
        }

        // 4. Spawning Logic
        // For each house, count residents.
        // We need a fast way to count. Iterate all chunks again? No, let's build a map from the loop above?
        // Optimized: We already iterated residents. Let's count residents per homeId in that loop?
        // Refactoring loop above to count residents per house.
        const residentsPerHouse: Record<string, number> = {};
        for (const chunk of residentChunks) {
            for (const r of chunk.residents) {
                residentsPerHouse[r.homeId] = (residentsPerHouse[r.homeId] || 0) + 1;
            }
        }

        const newResidents: any[] = [];

        for (const h of houses) {
            // Only finished houses
            if (h.constructionEnd && now < h.constructionEnd) continue;

            const count = residentsPerHouse[h.id] || 0;
            if (count < 4) {
                // Spawn chance (e.g., 50% per tick per empty slot? Or slower?)
                // User said "4 per house".
                if (Math.random() < 0.2) {
                    newResidents.push({
                        id: Math.random().toString(36).slice(2),
                        ownerId: h.ownerId,
                        homeId: h.id,
                        state: "idle",
                        x: h.x, // Spawn at house
                        y: h.y,
                        // Defaults
                    });
                }
            }
        }

        // Add new residents to chunks
        if (newResidents.length > 0) {
            // Find last chunk or create new
            let lastChunk = residentChunks[residentChunks.length - 1];
            if (!lastChunk || lastChunk.residents.length >= 100) { // Limit 100 per chunk
                 // Create new chunk
                 const newChunkIndex = residentChunks.length;
                 await ctx.db.insert("resident_chunks", {
                     gameId: args.gameId,
                     chunkIndex: newChunkIndex,
                     residents: newResidents // Potentially slice if too many? For now dump all.
                 });
            } else {
                // Append
                lastChunk.residents.push(...newResidents);
                await ctx.db.patch(lastChunk._id, { residents: lastChunk.residents });
            }
        }

        // 5. Update Credits
        for (const p of players) {
            const gain = (playerCredits[p._id] || 0) + 1000; // Base + Work
            if (gain > 0) {
                 await ctx.db.patch(p._id, {
                    credits: (p.credits || 0) + gain
                });
            }
        }

        // Schedule next tick
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

        // Delete players
        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();
        for (const p of players) {
            await ctx.db.delete(p._id);
        }

        // Delete teams
        const teams = await ctx.db.query("teams").filter(q => q.eq(q.field("gameId"), args.gameId)).collect();
        for (const t of teams) {
            await ctx.db.delete(t._id);
        }

        // Delete maps
        const maps = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        for (const m of maps) {
            await ctx.db.delete(m._id);
        }

        // Delete resident chunks
        const chunks = await ctx.db.query("resident_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        for (const c of chunks) {
            await ctx.db.delete(c._id);
        }

        // Delete game
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
        let residentChunks: any[] = [];

        // Only fetch buildings for dynamic state, not the whole map
        if (game.phase !== "lobby") {
             const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
             if (mapDoc) {
                 buildings = mapDoc.buildings;
                 planetType = mapDoc.planetType;
             }

             // Fetch residents
             residentChunks = await ctx.db.query("resident_chunks").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).collect();
        }

        return {
            game,
            players,
            buildings,
            planetType,
            residentChunks // Pass chunks to client
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
