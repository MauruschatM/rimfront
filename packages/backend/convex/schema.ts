import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const entityObject = {
  gameId: v.id("games"),
  ownerId: v.id("players"),
  familyId: v.optional(v.id("families")),
  troupeId: v.optional(v.id("troups")),
  type: v.string(), // "member", "commander", "soldier"
  state: v.string(), // "idle", "moving", "working", "sleeping", "patrol"
  x: v.number(),
  y: v.number(),
  isInside: v.boolean(),
  path: v.optional(v.array(v.object({ x: v.number(), y: v.number() }))),
  pathIndex: v.optional(v.number()),
  stateEnd: v.optional(v.number()), // For sleeping/working/patrol duration
  // Family specific
  homeId: v.optional(v.string()),
  workplaceId: v.optional(v.string()),
  targetWorkshopId: v.optional(v.string()), // Workshop member is walking to
  targetHomeId: v.optional(v.string()), // Home member is walking to (for sleep)
  workStartTime: v.optional(v.number()), // When work/sleep started (for duration)
};

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
    credits: v.number(),
  }),
  maps: defineTable({
    gameId: v.id("games"),
    width: v.number(),
    height: v.number(),
    structures: v.array(v.any()), // JSON object for structures
    buildings: v.array(v.any()), // JSON object for player buildings
    planetType: v.string(),
  }).index("by_gameId", ["gameId"]),
  chunks: defineTable({
    gameId: v.id("games"),
    chunkX: v.number(), // 0-3
    chunkY: v.number(), // 0-3
    tiles: v.array(v.number()), // 4096 elements (64x64)
  }).index("by_game", ["gameId"]),
  entities: defineTable(entityObject)
    .index("by_gameId", ["gameId"])
    .index("by_familyId", ["familyId"])
    .index("by_troupeId", ["troupeId"])
    .index("by_gameId_and_isInside", ["gameId", "isInside"]),
  families: defineTable({
    gameId: v.id("games"),
    homeId: v.string(), // ID from map.buildings
    ownerId: v.id("players"),
  }).index("by_gameId", ["gameId"]),
  troups: defineTable({
    gameId: v.id("games"),
    barracksId: v.string(), // ID from map.buildings
    ownerId: v.id("players"),
    targetPos: v.optional(v.object({ x: v.number(), y: v.number() })),
    lastSpawnTime: v.optional(v.number()),
    state: v.string(), // "idle", "moving" (Troop level state)
  }).index("by_gameId", ["gameId"]),
});
