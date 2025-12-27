import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

// 5x5 Central Base
const BASE_SIZE = 5;

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
    // Map is circular, but we just check array bounds and "void" tiles first
    if (args.x < 0 || args.x + BASE_SIZE > map.width || args.y < 0 || args.y + BASE_SIZE > map.height) {
      throw new Error("Out of bounds");
    }

    // Check collision with other buildings
    for (const b of map.buildings) {
        // Simple AABB
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
                phaseEnd: undefined // Indefinite or specific round time
            });

            // Start the tick loop
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

        // Give 1000 credits to every player
        const players = await ctx.db
            .query("players")
            .filter((q) => q.eq(q.field("gameId"), args.gameId))
            .collect();

        for (const player of players) {
            await ctx.db.patch(player._id, {
                credits: (player.credits || 0) + 1000
            });
        }

        // Schedule next tick in 5 seconds
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

        // Only fetch buildings for dynamic state, not the whole map
        if (game.phase !== "lobby") {
             const mapDoc = await ctx.db.query("maps").withIndex("by_gameId", q => q.eq("gameId", args.gameId)).first();
             if (mapDoc) {
                 buildings = mapDoc.buildings;
                 planetType = mapDoc.planetType; // Useful for UI context without loading full map
             }
        }

        return {
            game,
            players,
            buildings,
            planetType
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
