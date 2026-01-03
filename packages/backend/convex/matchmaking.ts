import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type MutationCtx, mutation, query } from "./_generated/server";
import { authComponent } from "./auth";
import { generateMap, PLANETS } from "./lib/mapgen";

async function findSuitableGame(
  ctx: MutationCtx,
  type: string,
  subMode: string
): Promise<{ gameId: Id<"games">; isNewGame: boolean }> {
  const waitingGames = await ctx.db
    .query("games")
    .filter((q) =>
      q.and(
        q.eq(q.field("status"), "waiting"),
        q.eq(q.field("type"), type),
        q.eq(q.field("subMode"), subMode)
      )
    )
    .take(5);

  for (const game of waitingGames) {
    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), game._id))
      .collect();

    if (players.length < 16) {
      return { gameId: game._id, isNewGame: false };
    }
  }

  const newGameId = await ctx.db.insert("games", {
    status: "waiting",
    type,
    subMode,
    createdAt: Date.now(),
  });

  return { gameId: newGameId, isNewGame: true };
}

async function assignToTeamsMode(
  ctx: MutationCtx,
  gameId: Id<"games">,
  teams: Doc<"teams">[],
  teamCounts: Record<string, number>
): Promise<Id<"teams">> {
  let teamA = teams.find((t) => t.type === "alpha");
  let teamB = teams.find((t) => t.type === "bravo");

  if (!teamA) {
    const id = await ctx.db.insert("teams", {
      gameId,
      name: "Alpha",
      type: "alpha",
    });
    teamA = (await ctx.db.get(id)) ?? undefined;
    if (teamA) teamCounts[teamA._id] = 0;
  }
  if (!teamB) {
    const id = await ctx.db.insert("teams", {
      gameId,
      name: "Bravo",
      type: "bravo",
    });
    teamB = (await ctx.db.get(id)) ?? undefined;
    if (teamB) teamCounts[teamB._id] = 0;
  }

  if (teamA && teamB) {
    return (teamCounts[teamA._id] || 0) <= (teamCounts[teamB._id] || 0)
      ? teamA._id
      : teamB._id;
  }
  throw new Error("Failed to assign team");
}

async function assignToSquadsMode(
  ctx: MutationCtx,
  gameId: Id<"games">,
  subMode: string,
  teams: Doc<"teams">[],
  teamCounts: Record<string, number>
): Promise<Id<"teams">> {
  const MAX_PER_TEAM = subMode === "duos" ? 2 : 4;

  for (const t of teams) {
    if ((teamCounts[t._id] || 0) < MAX_PER_TEAM) {
      return t._id;
    }
  }

  const teamNumber = teams.length + 1;
  const name = subMode === "duos" ? `Duo ${teamNumber}` : `Squad ${teamNumber}`;

  return await ctx.db.insert("teams", {
    gameId,
    name,
    type: subMode,
  });
}

async function assignPlayerToTeam(
  ctx: MutationCtx,
  gameId: Id<"games">,
  subMode: string
): Promise<Id<"teams"> | undefined> {
  if (subMode === "ffa") {
    return undefined;
  }

  const teams = await ctx.db
    .query("teams")
    .filter((q) => q.eq(q.field("gameId"), gameId))
    .collect();

  const players = await ctx.db
    .query("players")
    .filter((q) => q.eq(q.field("gameId"), gameId))
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

  if (subMode === "teams") {
    return assignToTeamsMode(ctx, gameId, teams, teamCounts);
  }
  return assignToSquadsMode(ctx, gameId, subMode, teams, teamCounts);
}

export const findOrCreateLobby = mutation({
  args: {
    type: v.string(), // "fronts"
    subMode: v.string(), // "ffa", "duos", "squads", "teams"
    playerName: v.string(),
    userId: v.optional(v.string()), // Passed from client if needed, or derived from context
  },
  handler: async (ctx, args) => {
    const cleanName = args.playerName.trim();
    // Sentinel Security: Basic input sanitization and length check
    if (!/^[a-zA-Z0-9 _-]+$/.test(cleanName)) {
      throw new Error("Player name contains invalid characters");
    }
    if (cleanName.length < 2 || cleanName.length > 20) {
      throw new Error("Player name must be between 2 and 20 characters");
    }

    // Sentinel Security: Prefer authenticated user ID
    const user = await authComponent.safeGetAuthUser(ctx);
    const userId = user ? user._id : args.userId;

    // Security: One active game per user (Rate Limiting / Anti-Spam)
    if (userId) {
      // Check only the most recent player records to avoid N+1 on full history
      const existingPlayers = await ctx.db
        .query("players")
        .withIndex("by_userId", (q) => q.eq("userId", userId))
        .order("desc") // Most recent first (by Creation ID)
        .take(10);

      for (const p of existingPlayers) {
        // Skip if the player was already eliminated
        if (p.status === "eliminated" || p.status === "spectator") {
          continue;
        }

        const g = await ctx.db.get(p.gameId);
        if (g && (g.status === "waiting" || g.status === "active")) {
          // User is already in a game. Redirect them to it.
          // This prevents joining multiple lobbies simultaneously.
          return { gameId: g._id, playerId: p._id };
        }
      }
    }

    const { gameId, isNewGame } = await findSuitableGame(
      ctx,
      args.type,
      args.subMode
    );
    const teamId = await assignPlayerToTeam(ctx, gameId, args.subMode);

    const playerId = await ctx.db.insert("players", {
      gameId,
      userId,
      isBot: false,
      name: cleanName,
      teamId,
      credits: 0,
      inflation: 1.0,
    });

    if (isNewGame) {
      await ctx.scheduler.runAfter(60_000, api.matchmaking.checkGameStart, {
        gameId,
      });
    }

    await ctx.scheduler.runAfter(0, api.matchmaking.checkGameStart, {
      gameId,
    });

    return { gameId, playerId };
  },
});

async function fillExistingTeams(
  ctx: MutationCtx,
  game: Doc<"games">,
  teams: Doc<"teams">[],
  teamCounts: Record<string, number>,
  slotsNeeded: number,
  MAX_PER_TEAM: number
): Promise<number> {
  let botsCreated = 0;
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
  return botsCreated;
}

async function createNewTeams(
  ctx: MutationCtx,
  game: Doc<"games">,
  teams: Doc<"teams">[],
  teamCounts: Record<string, number>,
  slotsNeeded: number,
  MAX_PER_TEAM: number,
  botsCreatedAlready: number
) {
  let botsCreated = botsCreatedAlready;

  while (botsCreated < slotsNeeded) {
    let targetTeamId: Id<"teams"> | undefined;

    if (game.subMode === "teams") {
      const teamA = teams.find((t) => t.type === "alpha");
      const teamB = teams.find((t) => t.type === "bravo");
      if (teamA && teamB) {
        targetTeamId =
          (teamCounts[teamA._id] || 0) <= (teamCounts[teamB._id] || 0)
            ? teamA._id
            : teamB._id;
      }
    } else {
      const teamNumber = Object.keys(teamCounts).length + 1;
      const name =
        game.subMode === "duos" ? `Duo ${teamNumber}` : `Squad ${teamNumber}`;
      targetTeamId = await ctx.db.insert("teams", {
        gameId: game._id,
        name,
        type: game.subMode,
      });
      teamCounts[targetTeamId] = 0;
    }

    if (targetTeamId) {
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
      break;
    }
  }
}

async function fillWithBots(
  ctx: MutationCtx,
  game: Doc<"games">,
  players: Doc<"players">[],
  slotsNeeded: number
) {
  if (game.subMode === "ffa") {
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
    return;
  }

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
  }
  if (game.subMode === "squads") {
    MAX_PER_TEAM = 4;
  }

  const botsCreated = await fillExistingTeams(
    ctx,
    game,
    teams,
    teamCounts,
    slotsNeeded,
    MAX_PER_TEAM
  );
  await createNewTeams(
    ctx,
    game,
    teams,
    teamCounts,
    slotsNeeded,
    MAX_PER_TEAM,
    botsCreated
  );
}

async function initializeGameMap(ctx: MutationCtx, gameId: Id<"games">) {
  const planetKeys = Object.values(PLANETS);
  const planetType = planetKeys[Math.floor(Math.random() * planetKeys.length)];

  const { tiles, structures } = generateMap(planetType, 256, 256);

  await ctx.db.insert("maps", {
    gameId,
    width: 256,
    height: 256,
    structures,
    buildings: [],
    planetType,
  });

  const CHUNK_SIZE = 64;
  const CHUNKS_PER_SIDE = 4;

  for (let chunkY = 0; chunkY < CHUNKS_PER_SIDE; chunkY++) {
    for (let chunkX = 0; chunkX < CHUNKS_PER_SIDE; chunkX++) {
      const chunkTiles: number[] = [];
      for (let y = 0; y < CHUNK_SIZE; y++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const globalX = chunkX * CHUNK_SIZE + x;
          const globalY = chunkY * CHUNK_SIZE + y;
          const tileIndex = globalY * 256 + globalX;
          chunkTiles.push(tiles[tileIndex]);
        }
      }
      await ctx.db.insert("chunks", {
        gameId,
        chunkX,
        chunkY,
        tiles: chunkTiles,
      });
    }
  }
}

export const checkGameStart = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "waiting") {
      return;
    }

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), game._id))
      .collect();
    const now = Date.now();
    const timeElapsed = now - game.createdAt;
    const shouldStart = players.length >= 16 || timeElapsed >= 60_000;

    if (shouldStart) {
      const slotsNeeded = 16 - players.length;
      if (slotsNeeded > 0) {
        await fillWithBots(ctx, game, players, slotsNeeded);
      }

      await initializeGameMap(ctx, game._id);

      await ctx.db.patch(game._id, {
        status: "active",
        startedAt: now,
        phase: "placement",
        phaseStart: now,
        phaseEnd: now + 15_000, // 15 Seconds
      });

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

    await ctx.db.delete(args.playerId);

    const remainingPlayers = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();

    if (remainingPlayers.length === 0) {
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

    await ctx.db.patch(args.gameId, {
      createdAt: Date.now() - 120_000,
    });

    await ctx.runMutation(api.matchmaking.checkGameStart, {
      gameId: args.gameId,
    });

    return { success: true };
  },
});
