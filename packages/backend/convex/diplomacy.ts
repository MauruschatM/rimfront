import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getAlliances = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("diplomacy")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
  },
});

export const requestAlliance = mutation({
  args: {
    gameId: v.id("games"),
    targetPlayerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found");

    if (player._id === args.targetPlayerId) {
      throw new Error("Cannot ally with self");
    }

    // Check existing
    const existing = await ctx.db
      .query("diplomacy")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .filter((q) =>
        q.or(
          q.and(
            q.eq(q.field("player1Id"), player._id),
            q.eq(q.field("player2Id"), args.targetPlayerId)
          ),
          q.and(
            q.eq(q.field("player1Id"), args.targetPlayerId),
            q.eq(q.field("player2Id"), player._id)
          )
        )
      )
      .first();

    const now = Date.now();

    if (existing) {
      if (existing.status === "allied") {
        throw new Error("Already allied");
      }
      if (existing.status === "pending") {
        if (existing.player1Id === player._id) {
          throw new Error("Request already sent");
        }
        throw new Error("They already requested an alliance with you");
      }
      if (player.lastBetrayalTime && now < player.lastBetrayalTime + 60_000) {
        throw new Error(
          "You recently betrayed an alliance. Trust must be earned."
        );
      }
    }

    await ctx.db.insert("diplomacy", {
      gameId: args.gameId,
      player1Id: player._id,
      player2Id: args.targetPlayerId,
      status: "pending",
      updatedAt: now,
    });
  },
});

export const acceptAlliance = mutation({
  args: {
    diplomacyId: v.id("diplomacy"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const diplomacy = await ctx.db.get(args.diplomacyId);
    if (!diplomacy) throw new Error("Request not found");

    if (diplomacy.status !== "pending") throw new Error("Not pending");

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), diplomacy.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found");

    // Only receiver (player2) can accept
    if (player._id !== diplomacy.player2Id) {
      throw new Error("Only the receiver can accept");
    }

    await ctx.db.patch(diplomacy._id, {
      status: "allied",
      updatedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });
  },
});

export const renewAlliance = mutation({
  args: {
    diplomacyId: v.id("diplomacy"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const diplomacy = await ctx.db.get(args.diplomacyId);
    if (!diplomacy) throw new Error("Alliance not found");

    if (diplomacy.status !== "allied") throw new Error("Not allied");

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), diplomacy.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found");
    if (
      player._id !== diplomacy.player1Id &&
      player._id !== diplomacy.player2Id
    ) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();
    const timeLeft = (diplomacy.expiresAt || 0) - now;

    // Allow renewal only in last 30 seconds
    if (timeLeft > 30_000) {
      throw new Error("Can only renew in the last 30 seconds");
    }

    await ctx.db.patch(diplomacy._id, {
      expiresAt: now + 5 * 60 * 1000,
      updatedAt: now,
    });
  },
});

export const rejectAlliance = mutation({
  args: {
    diplomacyId: v.id("diplomacy"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const diplomacy = await ctx.db.get(args.diplomacyId);
    if (!diplomacy) throw new Error("Request not found");

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), diplomacy.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found");

    // Either party can reject/cancel pending
    if (
      player._id !== diplomacy.player1Id &&
      player._id !== diplomacy.player2Id
    ) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(diplomacy._id);
  },
});

export const breakAlliance = mutation({
  args: {
    diplomacyId: v.id("diplomacy"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const diplomacy = await ctx.db.get(args.diplomacyId);
    if (!diplomacy) throw new Error("Alliance not found");

    if (diplomacy.status !== "allied") throw new Error("Not allied");

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), diplomacy.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found");

    // Either party can break
    if (
      player._id !== diplomacy.player1Id &&
      player._id !== diplomacy.player2Id
    ) {
      throw new Error("Unauthorized");
    }

    // Apply Penalty to the breaker
    await ctx.db.patch(player._id, {
      lastBetrayalTime: Date.now(),
    });

    await ctx.db.delete(diplomacy._id);
  },
});
