// 5x5 Central Base
export const BASE_SIZE = 5;

export const BUILDING_TYPES = {
  HOUSE: "house",
  WORKSHOP: "workshop",
  BARRACKS: "barracks",
  CENTRAL_BASE: "base_central",
  WALL: "wall",
  TURRET: "turret",
} as const;

export type BuildingType = typeof BUILDING_TYPES[keyof typeof BUILDING_TYPES];

export const UNIT_TYPES = {
  MEMBER: "member",
  COMMANDER: "commander",
  SOLDIER: "soldier",
  TURRET_GUN: "turret_gun",
} as const;

export type UnitType = typeof UNIT_TYPES[keyof typeof UNIT_TYPES];

export const BUILDINGS: Record<
  string,
  { width: number; height: number; cost: number; timePerTile: number }
> = {
  [BUILDING_TYPES.HOUSE]: {
    width: 2,
    height: 2,
    cost: 2000,
    timePerTile: 2000,
  },
  [BUILDING_TYPES.WORKSHOP]: {
    width: 4,
    height: 4,
    cost: 4000,
    timePerTile: 2000,
  },
  [BUILDING_TYPES.BARRACKS]: {
    width: 3,
    height: 3,
    cost: 4000,
    timePerTile: 2000,
  },
  [BUILDING_TYPES.WALL]: {
    width: 1,
    height: 1,
    cost: 500,
    timePerTile: 2000,
  },
  [BUILDING_TYPES.TURRET]: {
    width: 2,
    height: 2,
    cost: 5000,
    timePerTile: 5000,
  },
};

// Tick & Round timing
export const TICK_INTERVAL_MS = 100; // 100ms per tick
export const TICKS_PER_ROUND = 50; // 50 ticks = 5 seconds = 1 round

// Movement: 8 ticks to traverse one tile = 800ms per tile
export const TICKS_PER_TILE = 8;

// Capacity constants
export const FACTORY_CAPACITY = 16;
export const HOUSE_CAPACITY = 4;
export const BARRACKS_CAPACITY = 4;

// Spawn interval: 30 seconds for both residents and soldiers
export const SPAWN_INTERVAL_MS = 30_000;
