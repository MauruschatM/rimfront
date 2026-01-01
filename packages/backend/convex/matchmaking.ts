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
    // Security: Validate player name
    const cleanName = args.playerName.trim();
    if (cleanName.length < 2 || cleanName.length > 20) {
      throw new Error("Player name must be between 2 and 20 characters");
    }

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

    let gameIdToJoin: Id<"games"> | null = null;
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
    let teamId: string | undefined;

    if (args.subMode !== "ffa" && gameIdToJoin) {
      const teams = await ctx.db
        .query("teams")
        .filter((q) => q.eq(q.field("gameId"), gameIdToJoin as Id<"games">))
        .collect();

      const players = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), gameIdToJoin as Id<"games">))
        .collect();

      // Calculate current team sizes
      const teamCounts: Record<string, number> = {};
      for (const t of teams) {
        teamCounts[t._id] = 0;
      }
      for (const p of players) {
        if (p.teamId) {
          teamCounts[p.teamId] = (teamCounts[p.teamId] || 0) + 1;
        }
      }

      let MAX_PER_TEAM = 100; // Default for "teams"
      if (args.subMode === "duos") {
        MAX_PER_TEAM = 2;
      } else if (args.subMode === "squads") {
        MAX_PER_TEAM = 4;
      }

      if (args.subMode === "teams") {
        // "2 Teams" Logic (Alpha/Bravo)
        let teamA = teams.find((t) => t.type === "alpha");
        let teamB = teams.find((t) => t.type === "bravo");

        if (!teamA) {
          const id = await ctx.db.insert("teams", {
            gameId: gameIdToJoin,
            name: "Alpha",
            type: "alpha",
          });
          teamA = {
            _id: id,
            gameId: gameIdToJoin,
            name: "Alpha",
            type: "alpha",
          };
          teamCounts[id] = 0;
        }
        if (!teamB) {
          const id = await ctx.db.insert("teams", {
            gameId: gameIdToJoin,
            name: "Bravo",
            type: "bravo",
          });
          teamB = {
            _id: id,
            gameId: gameIdToJoin,
            name: "Bravo",
            type: "bravo",
          };
          teamCounts[id] = 0;
        }

        // Assign to smaller team
        if ((teamCounts[teamA._id] || 0) <= (teamCounts[teamB._id] || 0)) {
          teamId = teamA._id;
        } else {
          teamId = teamB._id;
        }
      } else {
        // "Duos" or "Squads" Logic
        // Find first team with space
        let foundTeamId: string | null = null;
        for (const t of teams) {
          if ((teamCounts[t._id] || 0) < MAX_PER_TEAM) {
            foundTeamId = t._id;
            break;
          }
        }

        if (foundTeamId) {
          teamId = foundTeamId;
        } else {
          // Create new team
          const teamNumber = teams.length + 1;
          const name =
            args.subMode === "duos"
              ? `Duo ${teamNumber}`
              : `Squad ${teamNumber}`;

          teamId = await ctx.db.insert("teams", {
            gameId: gameIdToJoin,
            name,
            type: args.subMode, // "duos" or "squads"
          });
        }
      }
    }

    const playerId = await ctx.db.insert("players", {
      gameId: gameIdToJoin,
      userId: args.userId,
      isBot: false,
      name: cleanName,
      teamId,
      credits: 0,
      inflation: 1.0,
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
    if (!game || game.status !== "waiting") {
      return;
    }

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
        if (game.subMode !== "ffa") {
          const teams = await ctx.db
            .query("teams")
            .filter((q) => q.eq(q.field("gameId"), game._id))
            .collect();

          const teamCounts: Record<string, number> = {};
          for (const t of teams) {
            teamCounts[t._id] = 0;
          }
          for (const p of players) {
            if (p.teamId) {
              teamCounts[p.teamId] = (teamCounts[p.teamId] || 0) + 1;
            }
          }

          let MAX_PER_TEAM = 100;
          if (game.subMode === "duos") {
            MAX_PER_TEAM = 2;
          } else if (game.subMode === "squads") {
            MAX_PER_TEAM = 4;
          }

          let botsCreated = 0;

          // 1. Fill existing teams first
          for (const team of teams) {
            while (
              (teamCounts[team._id] || 0) < MAX_PER_TEAM &&
              botsCreated < slotsNeeded
            ) {
              await ctx.db.insert("players", {
                gameId: game._id,
                isBot: true,
                name: `Bot-${Math.floor(Math.random() * 1000)}`,
                teamId: team._id,
                credits: 0,
                inflation: 1.0,
              });
              teamCounts[team._id]++;
              botsCreated++;
            }
          }

          // 2. Create new teams if still needed (for Duos/Squads)
          while (botsCreated < slotsNeeded) {
            // Find or create a team that needs members
            let targetTeamId: string | null = null;

            if (game.subMode === "teams") {
              // Should not happen if Alpha/Bravo exist and we filled them, unless they are full (100?)
              // Re-check smallest
              const teamA = teams.find((t) => t.type === "alpha");
              const teamB = teams.find((t) => t.type === "bravo");
              if (teamA && teamB) {
                targetTeamId =
                  (teamCounts[teamA._id] || 0) <= (teamCounts[teamB._id] || 0)
                    ? teamA._id
                    : teamB._id;
              }
            } else {
              // Create new team
              const teamNumber = Object.keys(teamCounts).length + 1;
              const name =
                game.subMode === "duos"
                  ? `Duo ${teamNumber}`
                  : `Squad ${teamNumber}`;
              targetTeamId = await ctx.db.insert("teams", {
                gameId: game._id,
                name,
                type: game.subMode,
              });
              teamCounts[targetTeamId] = 0;
            }

            if (targetTeamId) {
              // Fill this new team up to MAX or until slots exhausted
              while (
                (teamCounts[targetTeamId] || 0) < MAX_PER_TEAM &&
                botsCreated < slotsNeeded
              ) {
                await ctx.db.insert("players", {
                  gameId: game._id,
                  isBot: true,
                  name: `Bot-${Math.floor(Math.random() * 1000)}`,
                  teamId: targetTeamId,
                  credits: 0,
                  inflation: 1.0,
                });
                teamCounts[targetTeamId]++;
                botsCreated++;
              }
            } else {
              // Fallback (shouldn't happen)
              break;
            }
          }
        } else {
          // FFA
          for (let i = 0; i < slotsNeeded; i++) {
            await ctx.db.insert("players", {
              gameId: game._id,
              userId: undefined,
              isBot: true,
              name: `Bot-${Math.floor(Math.random() * 1000)}`,
              teamId: undefined,
              credits: 0,
              inflation: 1.0,
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
    if (!player) {
      return;
    }

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
      await ctx.runMutation(internal.game.deleteGameInternal, {
        gameId: args.gameId,
      });
    }

    return { success: true };
  },
});

export const forceStartLobby = mutation({
  args: {
    gameId: v.id("games"),
    playerId: v.id("players"),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args) => {
    const player = await ctx.db.get(args.playerId);
    if (!player) {
      throw new Error("Player not found");
    }

    if (player.gameId !== args.gameId) {
      throw new Error("Player is not in this game");
    }

    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "waiting") {
      throw new Error("Game is not in waiting state");
    }

    // Force the game check to start the game immediately
    // Temporarily update createdAt to make the timer expire
    await ctx.db.patch(args.gameId, {
      createdAt: Date.now() - 120_000, // Set to 2 minutes ago to trigger start
    });

    // Run the game start check
    await ctx.runMutation(api.matchmaking.checkGameStart, {
      gameId: args.gameId,
    });

    return { success: true };
  },
});
