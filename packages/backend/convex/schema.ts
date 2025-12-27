import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  games: defineTable({
    status: v.string(), // "waiting", "active", "ended"
    type: v.string(), // "fronts"
    subMode: v.string(), // "ffa", "duos", "squads", "teams"
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    phase: v.optional(v.string()), // "lobby", "placement", "simulation"
    phaseStart: v.optional(v.number()),
    phaseEnd: v.optional(v.number()),
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
    hasPlacedBase: v.optional(v.boolean()),
  }),
  maps: defineTable({
    gameId: v.id("games"),
    width: v.number(),
    height: v.number(),
    tiles: v.array(v.number()), // Flattened 2D array
    structures: v.array(v.any()), // JSON object for structures
    buildings: v.array(v.any()), // JSON object for player buildings
    planetType: v.string(),
  }).index("by_gameId", ["gameId"]),
});
