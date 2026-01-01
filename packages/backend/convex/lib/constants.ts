// 5x5 Central Base
export const BASE_SIZE = 5;

export const BUILDINGS: Record<
  string,
  { width: number; height: number; cost: number; timePerTile: number }
> = {
  house: { width: 2, height: 2, cost: 2000, timePerTile: 2000 },
  workshop: { width: 4, height: 4, cost: 4000, timePerTile: 2000 },
  barracks: { width: 3, height: 3, cost: 4000, timePerTile: 2000 },
  wall: { width: 1, height: 1, cost: 500, timePerTile: 2000 },
  turret: { width: 2, height: 2, cost: 5000, timePerTile: 5000 },
};

// Tick & Round timing
export const TICK_INTERVAL_MS = 100; // 100ms per tick
export const TICKS_PER_ROUND = 50; // 50 ticks = 5 seconds = 1 round

// Movement: 8 ticks to traverse one tile = 800ms per tile
export const TICKS_PER_TILE = 8;

// Factory capacity for reservation system
export const FACTORY_CAPACITY = 16;

// Spawn interval: 30 seconds for both residents and soldiers
export const SPAWN_INTERVAL_MS = 30_000;
