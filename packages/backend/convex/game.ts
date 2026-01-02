import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { BASE_SIZE, BUILDINGS, TICK_INTERVAL_MS } from "./lib/constants";
import { calculateBuildingCost } from "./lib/economy";
import {
  findRandomBasePosition,
  validateBuildingPlacement,
} from "./lib/placement";
import { runGameTick } from "./lib/simulation";
import type { Building, Structure } from "./lib/types";

export const placeBase = mutation({
  args: {
    gameId: v.id("games"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(args.gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    if (game.phase !== "placement") {
      throw new Error("Not in placement phase");
    }

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) {
      throw new Error("Player not found in this game");
    }

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) {
      throw new Error("Map not generated");
    }

    if (
      args.x < 0 ||
      args.x + BASE_SIZE > map.width ||
      args.y < 0 ||
      args.y + BASE_SIZE > map.height
    ) {
      throw new Error("Out of bounds");
    }

    // Remove existing base from this player (if any) to allow repositioning
    const buildingsWithoutMyBase = map.buildings.filter(
      (b: any) => !(b.ownerId === player._id && b.type === "base_central")
    );

    // Check collision with OTHER buildings only (not own base)
    for (const b of buildingsWithoutMyBase) {
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
      health: 1000,
    };

    // Add new base to filtered list (without old base)
    const newBuildings = [...buildingsWithoutMyBase, newBuilding];

    await ctx.db.patch(map._id, {
      buildings: newBuildings,
    });

    await ctx.db.patch(player._id, {
      hasPlacedBase: true,
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
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const game = await ctx.db.get(args.gameId);
    if (!game) {
      throw new Error("Game not found");
    }

    if (game.phase !== "simulation") {
      throw new Error("Build mode only available in simulation phase");
    }

    const buildingSpec = BUILDINGS[args.buildingType];
    if (!buildingSpec) {
      throw new Error("Invalid building type");
    }

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) {
      throw new Error("Player not found");
    }

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) {
      throw new Error("Map not generated");
    }

    const cost = calculateBuildingCost(
      buildingSpec.cost,
      map.buildings,
      player._id,
      args.buildingType,
      player.inflation || 1.0 // Pass player's stored inflation
    );

    if ((player.credits || 0) < cost) {
      throw new Error("Not enough credits");
    }

    const myBuildings = map.buildings.filter(
      (b: any) => b.ownerId === player._id
    );

    validateBuildingPlacement(
      args.x,
      args.y,
      buildingSpec.width,
      buildingSpec.height,
      map.width,
      map.height,
      map.buildings,
      map.structures as Structure[],
      myBuildings
    );

    // Deduct credits and update inflation
    if (cost > 0) {
      // Non-free building: deduct cost and double inflation
      const currentInflation = player.inflation || 1.0;
      await ctx.db.patch(player._id, {
        credits: (player.credits || 0) - cost,
        inflation: currentInflation * 2, // Double inflation on each build
      });
    } else {
      // Free building (first of type): only deduct credits (0), inflation stays 1.0
      await ctx.db.patch(player._id, {
        credits: (player.credits || 0) - cost,
      });
    }

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
      constructionEnd,
    };

    const newBuildings = [...map.buildings, newBuilding];

    await ctx.db.patch(map._id, {
      buildings: newBuildings,
    });

    return { success: true, building: newBuilding, cost };
  },
});

export const endPlacementPhase = internalMutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return;
    }

    if (game.phase === "placement") {
      // Get all players and map
      const players = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), args.gameId))
        .collect();

      const map = await ctx.db
        .query("maps")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .first();

      if (!map) {
        return;
      }

      // Find players who haven't placed their base
      const playersWithoutBase = players.filter((p) => !p.hasPlacedBase);

      // Auto-place bases for all players who haven't placed
      // We do this sequentially so each new base is considered for next placement
      const currentBuildings = [...map.buildings] as Building[];

      for (const player of playersWithoutBase) {
        // Find optimal position with maximum distance from existing bases
        const position = findRandomBasePosition(
          map.width,
          map.height,
          currentBuildings,
          map.structures as Structure[],
          BASE_SIZE
        );

        // Create new base building
        const newBuilding: Building = {
          id: Math.random().toString(36).slice(2),
          ownerId: player._id,
          type: "base_central",
          x: position.x,
          y: position.y,
          width: BASE_SIZE,
          height: BASE_SIZE,
          health: 1000,
        };

        // Add to current buildings (for next iteration)
        currentBuildings.push(newBuilding);

        // Mark player as having placed base
        await ctx.db.patch(player._id, {
          hasPlacedBase: true,
        });
      }

      // Save all new buildings to map
      if (playersWithoutBase.length > 0) {
        await ctx.db.patch(map._id, {
          buildings: currentBuildings,
        });
      }

      // Transition to simulation phase
      await ctx.db.patch(game._id, {
        phase: "simulation",
        phaseStart: Date.now(),
        phaseEnd: Date.now() + 30 * 60 * 1000, // 30 Minutes
      });

      await ctx.scheduler.runAfter(0, internal.game.tick, { gameId: game._id });
    }
  },
});

export const tick = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    await runGameTick(ctx, args.gameId);
    // Re-schedule tick
    await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.game.tick, {
      gameId: args.gameId,
    });
  },
});

export const deleteGameInternal = internalMutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return;
    }

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();
    for (const p of players) {
      await ctx.db.delete(p._id);
    }

    const teams = await ctx.db
      .query("teams")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();
    for (const t of teams) {
      await ctx.db.delete(t._id);
    }

    const maps = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const m of maps) {
      await ctx.db.delete(m._id);
    }

    const mapChunks = await ctx.db
      .query("chunks")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const c of mapChunks) {
      await ctx.db.delete(c._id);
    }

    const entities = await ctx.db
      .query("entities")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const e of entities) {
      await ctx.db.delete(e._id);
    }

    const families = await ctx.db
      .query("families")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const f of families) {
      await ctx.db.delete(f._id);
    }

    const troops = await ctx.db
      .query("troops")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const t of troops) {
      await ctx.db.delete(t._id);
    }

    await ctx.db.delete(game._id);
  },
});

export const deleteGame = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    // 1. Auth Check
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    // 2. Fetch Game
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return; // Silent return if game already gone
    }

    // 3. Fetch Players
    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();

    // 4. Verify user is a player in this game OR is an admin
    const isAdmin = identity.email === "moritz.mauruschat@gmail.com";
    const isPlayer = players.some((p) => p.userId === identity.subject);

    if (!(isPlayer || isAdmin)) {
      throw new Error("You are not authorized to delete this game");
    }

    // 5. Griefing Protection: Only allow deletion if user is the LAST player OR is an admin
    if (players.length > 1 && !isAdmin) {
      throw new Error("Cannot delete game while other players are present");
    }

    // 6. Safe to delete
    await ctx.runMutation(internal.game.deleteGameInternal, {
      gameId: args.gameId,
    });
  },
});

export const getGameState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return null;
    }

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();

    let buildings: any[] = [];
    let planetType = "";
    let entities: any[] = [];
    let families: any[] = [];
    let troops: any[] = [];

    if (game.phase !== "lobby") {
      const mapDoc = await ctx.db
        .query("maps")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .first();
      if (mapDoc) {
        buildings = mapDoc.buildings;
        planetType = mapDoc.planetType;
      }
      entities = await ctx.db
        .query("entities")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
      families = await ctx.db
        .query("families")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
      troops = await ctx.db
        .query("troops")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
    }

    return {
      game,
      players,
      buildings,
      planetType,
      entities,
      families,
      troops,
    };
  },
});

export const getStaticMap = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!mapDoc) {
      return null;
    }

    // Load all chunks - frontend will reassemble
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return {
      _id: mapDoc._id,
      width: mapDoc.width,
      height: mapDoc.height,
      planetType: mapDoc.planetType,
      chunks, // Return chunks, not reassembled tiles
      structures: mapDoc.structures,
    };
  },
});

export const moveTroop = mutation({
  args: {
    gameId: v.id("games"),
    troopId: v.id("troops"),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const troop = await ctx.db.get(args.troopId);
    if (!troop) {
      throw new Error("Troop not found");
    }

    // Check ownership
    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();
    if (!player) {
      throw new Error("Player not found");
    }

    if (troop.ownerId !== player._id) {
      throw new Error("Not your troop");
    }

    // Update Target (clear building target when moving to position)
    await ctx.db.patch(troop._id, {
      targetPos: { x: args.targetX, y: args.targetY },
      targetBuildingId: undefined,
      state: "moving",
    });

    // Reset members to ensure they pathfind
    const members = await ctx.db
      .query("entities")
      .withIndex("by_troopId", (q) => q.eq("troopId", troop._id))
      .collect();

    for (const member of members) {
      await ctx.db.patch(member._id, {
        state: "idle",
        path: undefined,
        pathIndex: undefined,
        nextPathAttempt: undefined, // Reset backoff so they react immediately
      });
    }
  },
});

export const attackBuilding = mutation({
  args: {
    gameId: v.id("games"),
    troopId: v.id("troops"),
    buildingId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthorized");
    }

    const troop = await ctx.db.get(args.troopId);
    if (!troop) {
      throw new Error("Troop not found");
    }

    // Check ownership
    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();
    if (!player) {
      throw new Error("Player not found");
    }

    if (troop.ownerId !== player._id) {
      throw new Error("Not your troop");
    }

    // Get the target building
    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!map) {
      throw new Error("Map not found");
    }

    const building = map.buildings.find((b: any) => b.id === args.buildingId);
    if (!building) {
      throw new Error("Building not found");
    }

    // Verify it's an enemy building
    if (building.ownerId === player._id) {
      throw new Error("Cannot attack your own building");
    }

    // Set building target and move troop towards it
    const targetX = building.x + building.width / 2;
    const targetY = building.y + building.height / 2;

    await ctx.db.patch(troop._id, {
      targetPos: { x: targetX, y: targetY },
      targetBuildingId: args.buildingId,
      state: "moving",
    });

    // Reset members to ensure they pathfind
    const members = await ctx.db
      .query("entities")
      .withIndex("by_troopId", (q) => q.eq("troopId", troop._id))
      .collect();

    for (const member of members) {
      await ctx.db.patch(member._id, {
        state: "idle",
        path: undefined,
        pathIndex: undefined,
        nextPathAttempt: undefined,
      });
    }
  },
});
