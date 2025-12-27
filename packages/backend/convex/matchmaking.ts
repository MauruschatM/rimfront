import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { api } from "./_generated/api";

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
    let teamId = undefined;

    // Simple logic: if 'teams', assign to smaller team
    // This assumes 2 teams for now as per "2 Teams" mode
    if (args.subMode === "teams") {
        const teams = await ctx.db.query("teams").filter(q => q.eq(q.field("gameId"), gameIdToJoin!)).collect();
        let teamA, teamB;
        // Logic to reuse or create teams
        if (teams.length === 0) {
             teamA = await ctx.db.insert("teams", { gameId: gameIdToJoin, name: "Alpha", type: "alpha" });
             teamB = await ctx.db.insert("teams", { gameId: gameIdToJoin, name: "Bravo", type: "bravo" });
        } else {
             teamA = teams[0]._id;
             // Ensure we have a second team if one exists but not the other (unlikely but safe)
             teamB = teams[1] ? teams[1]._id : (await ctx.db.insert("teams", { gameId: gameIdToJoin, name: "Bravo", type: "bravo" }));
        }

        // Count players to balance
        // Note: This is slightly expensive, ideally we'd store counts on the team object
        const playersA = await ctx.db.query("players").filter(q => q.and(q.eq(q.field("gameId"), gameIdToJoin!), q.eq(q.field("teamId"), teamA))).collect();
        const playersB = await ctx.db.query("players").filter(q => q.and(q.eq(q.field("gameId"), gameIdToJoin!), q.eq(q.field("teamId"), teamB))).collect();

        if (playersA.length <= playersB.length) {
            teamId = teamA;
        } else {
            teamId = teamB;
        }
    }

    await ctx.db.insert("players", {
      gameId: gameIdToJoin,
      userId: args.userId,
      isBot: false,
      name: args.playerName,
      teamId: teamId,
    });

    // Schedule game check
    // If it's a new game, schedule the 60s timeout check
    if (isNewGame) {
        await ctx.scheduler.runAfter(60000, api.matchmaking.checkGameStart, { gameId: gameIdToJoin });
    }

    // Also run an immediate check (asynchronously) to see if we filled it up (16 players)
    // We use runAfter(0) to not block the response
    await ctx.scheduler.runAfter(0, api.matchmaking.checkGameStart, { gameId: gameIdToJoin });

    return { gameId: gameIdToJoin };
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
        const players = await ctx.db.query("players").filter(q => q.eq(q.field("gameId"), game._id)).collect();
        const now = Date.now();
        const timeElapsed = now - game.createdAt;
        const shouldStart = players.length >= 16 || timeElapsed >= 60000;

        if (shouldStart) {
            // Fill with bots
            const slotsNeeded = 16 - players.length;
            if (slotsNeeded > 0) {
                // If teams are involved, we need to balance bots too
                // Simplified bot filling for now
                if (game.subMode === "teams") {
                    // Re-fetch teams
                    const teams = await ctx.db.query("teams").filter(q => q.eq(q.field("gameId"), game._id)).collect();
                     if (teams.length >= 2) {
                        const teamA = teams[0]._id;
                        const teamB = teams[1]._id;
                         // Count again
                        let countA = players.filter(p => p.teamId === teamA).length;
                        let countB = players.filter(p => p.teamId === teamB).length;

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
                                 teamId: botTeam
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
                            teamId: undefined
                        });
                    }
                }
            }

            // Update game status
            await ctx.db.patch(game._id, {
                status: "active",
                startedAt: now
            });

            return { started: true };
        }

        return { started: false, timeLeft: Math.max(0, 60000 - timeElapsed), currentPlayers: players.length };
    }
});
