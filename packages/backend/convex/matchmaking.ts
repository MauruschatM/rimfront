import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { generateMap, PLANETS } from "./lib/mapgen";

export const findOrCreateLobby = mutation({
  args: {
    type: v.string(), // "fronts"
    subMode: v.string(), // "ffa", "duos", "squads", "teams"
    playerName: v.string(),
    userId: v.optional(v.string()), // Passed from client if needed, or derived from context
  },
  handler: async (ctx, args) => {
    // 1. Look for an existing waiting game of this type/subMode
    const waitingGames = await ctx.db
      .query("games")
      .filter((q) =>
        q.and(
          q.eq(q.field("status"), "waiting"),
          q.eq(q.field("type"), args.type),
          q.eq(q.field("subMode"), args.subMode)
        )
      )
      .take(5);

    let gameIdToJoin = null;
    let isNewGame = false;

    for (const game of waitingGames) {
      const players = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), game._id))
        .collect();

      if (players.length < 16) {
        gameIdToJoin = game._id;
        break;
      }
    }

    // 2. If no suitable game found, create a new one
    if (!gameIdToJoin) {
      gameIdToJoin = await ctx.db.insert("games", {
        status: "waiting",
        type: args.type,
        subMode: args.subMode,
        createdAt: Date.now(),
      });
      isNewGame = true;
    }

    // 3. Add player to the game
    let teamId;

    // Simple logic: if 'teams', assign to smaller team
    // This assumes 2 teams for now as per "2 Teams" mode
    if (args.subMode === "teams") {
      const teams = await ctx.db
        .query("teams")
        .filter((q) => q.eq(q.field("gameId"), gameIdToJoin!))
        .collect();
      let teamA, teamB;
      // Logic to reuse or create teams
      if (teams.length === 0) {
        teamA = await ctx.db.insert("teams", {
          gameId: gameIdToJoin,
          name: "Alpha",
          type: "alpha",
        });
        teamB = await ctx.db.insert("teams", {
          gameId: gameIdToJoin,
          name: "Bravo",
          type: "bravo",
        });
      } else {
        teamA = teams[0]._id;
        // Ensure we have a second team if one exists but not the other (unlikely but safe)
        teamB = teams[1]
          ? teams[1]._id
          : await ctx.db.insert("teams", {
              gameId: gameIdToJoin,
              name: "Bravo",
              type: "bravo",
            });
      }

      // Count players to balance
      // Note: This is slightly expensive, ideally we'd store counts on the team object
      const playersA = await ctx.db
        .query("players")
        .filter((q) =>
          q.and(
            q.eq(q.field("gameId"), gameIdToJoin!),
            q.eq(q.field("teamId"), teamA)
          )
        )
        .collect();
      const playersB = await ctx.db
        .query("players")
        .filter((q) =>
          q.and(
            q.eq(q.field("gameId"), gameIdToJoin!),
            q.eq(q.field("teamId"), teamB)
          )
        )
        .collect();

      if (playersA.length <= playersB.length) {
        teamId = teamA;
      } else {
        teamId = teamB;
      }
    }

    const playerId = await ctx.db.insert("players", {
      gameId: gameIdToJoin,
      userId: args.userId,
      isBot: false,
      name: args.playerName,
      teamId,
      credits: 0,
    });

    // Schedule game check
    // If it's a new game, schedule the 60s timeout check
    if (isNewGame) {
      await ctx.scheduler.runAfter(60_000, api.matchmaking.checkGameStart, {
        gameId: gameIdToJoin,
      });
    }

    // Also run an immediate check (asynchronously) to see if we filled it up (16 players)
    // We use runAfter(0) to not block the response
    await ctx.scheduler.runAfter(0, api.matchmaking.checkGameStart, {
      gameId: gameIdToJoin,
    });

    return { gameId: gameIdToJoin, playerId };
  },
});

export const checkGameStart = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "waiting") return;

    // Check conditions
    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), game._id))
      .collect();
    const now = Date.now();
    const timeElapsed = now - game.createdAt;
    const shouldStart = players.length >= 16 || timeElapsed >= 60_000;

    if (shouldStart) {
      // Fill with bots
      const slotsNeeded = 16 - players.length;
      if (slotsNeeded > 0) {
        // If teams are involved, we need to balance bots too
        // Simplified bot filling for now
        if (game.subMode === "teams") {
          // Re-fetch teams
          const teams = await ctx.db
            .query("teams")
            .filter((q) => q.eq(q.field("gameId"), game._id))
            .collect();
          if (teams.length >= 2) {
            const teamA = teams[0]._id;
            const teamB = teams[1]._id;
            // Count again
            let countA = players.filter((p) => p.teamId === teamA).length;
            let countB = players.filter((p) => p.teamId === teamB).length;

            for (let i = 0; i < slotsNeeded; i++) {
              // Assign to smaller team
              let botTeam;
              if (countA <= countB) {
                botTeam = teamA;
                countA++;
              } else {
                botTeam = teamB;
                countB++;
              }
              await ctx.db.insert("players", {
                gameId: game._id,
                userId: undefined,
                isBot: true,
                name: `Bot-${Math.floor(Math.random() * 1000)}`,
                teamId: botTeam,
                credits: 0,
              });
            }
          }
        } else {
          // FFA / No teams
          for (let i = 0; i < slotsNeeded; i++) {
            await ctx.db.insert("players", {
              gameId: game._id,
              userId: undefined,
              isBot: true,
              name: `Bot-${Math.floor(Math.random() * 1000)}`,
              teamId: undefined,
              credits: 0,
            });
          }
        }
      }

      // Select Random Planet
      const planetKeys = Object.values(PLANETS);
      const planetType =
        planetKeys[Math.floor(Math.random() * planetKeys.length)];

      // Generate Map
      const { tiles, structures } = generateMap(planetType, 256, 256);

      // Save Map metadata (without tiles)
      await ctx.db.insert("maps", {
        gameId: game._id,
        width: 256,
        height: 256,
        structures,
        buildings: [],
        planetType,
      });

      // Split tiles into 16 chunks (4x4 grid, each 64x64 = 4096 tiles)
      const CHUNK_SIZE = 64;
      const CHUNKS_PER_SIDE = 4;

      for (let chunkY = 0; chunkY < CHUNKS_PER_SIDE; chunkY++) {
        for (let chunkX = 0; chunkX < CHUNKS_PER_SIDE; chunkX++) {
          const chunkTiles: number[] = [];

          // Extract tiles for this chunk
          for (let y = 0; y < CHUNK_SIZE; y++) {
            for (let x = 0; x < CHUNK_SIZE; x++) {
              const globalX = chunkX * CHUNK_SIZE + x;
              const globalY = chunkY * CHUNK_SIZE + y;
              const tileIndex = globalY * 256 + globalX;
              chunkTiles.push(tiles[tileIndex]);
            }
          }

          await ctx.db.insert("chunks", {
            gameId: game._id,
            chunkX,
            chunkY,
            tiles: chunkTiles,
          });
        }
      }

      // Update game status & Phase
      await ctx.db.patch(game._id, {
        status: "active",
        startedAt: now,
        phase: "placement",
        phaseStart: now,
        phaseEnd: now + 15_000, // 15 Seconds
      });

      // Schedule End of Placement Phase
      await ctx.scheduler.runAfter(15_000, internal.game.endPlacementPhase, {
        gameId: game._id,
      });

      return { started: true };
    }

    return {
      started: false,
      timeLeft: Math.max(0, 60_000 - timeElapsed),
      currentPlayers: players.length,
    };
  },
});

export const getLobbyStatus = query({
  args: {
    gameId: v.id("games"),
  },
  returns: v.union(
    v.object({
      status: v.literal("waiting"),
      playerCount: v.number(),
      maxPlayers: v.number(),
      startTime: v.number(),
      timeLeft: v.number(),
    }),
    v.object({
      status: v.literal("started"),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return null;
    }

    // Game already started
    if (game.status !== "waiting") {
      return { status: "started" as const };
    }

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), game._id))
      .collect();

    const now = Date.now();
    const timeElapsed = now - game.createdAt;
    const timeLeft = Math.max(0, 60_000 - timeElapsed);

    return {
      status: "waiting" as const,
      playerCount: players.length,
      maxPlayers: 16,
      startTime: game.createdAt,
      timeLeft,
    };
  },
});

export const leaveLobby = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) return;

    if (player.gameId !== args.gameId) {
      throw new Error("Player is not in this game");
    }

    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "waiting") {
      throw new Error("Can only leave a waiting game");
    }

    // Delete the player
    await ctx.db.delete(args.playerId);

    // Check if any players remain
    const remainingPlayers = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();

    if (remainingPlayers.length === 0) {
      // Delete the game if no players left
      await ctx.runMutation(api.game.deleteGame, { gameId: args.gameId });
    }

    return { success: true };
  },
});
