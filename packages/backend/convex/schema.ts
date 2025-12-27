import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    status: v.string(), // "waiting", "active", "ended"
    type: v.string(), // "fronts"
    subMode: v.string(), // "ffa", "duos", "squads", "teams"
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
  }),
  teams: defineTable({
    gameId: v.id("games"),
    name: v.string(),
    type: v.string(), // "t_terrorist", "t_counter", "duo_1", etc.
  }),
  players: defineTable({
    gameId: v.id("games"),
    userId: v.optional(v.string()), // Null for bots
    isBot: v.boolean(),
    name: v.string(),
    teamId: v.optional(v.id("teams")),
  }),
});
