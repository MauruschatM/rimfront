import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { createCollisionMap, findPath } from "./lib/pathfinding";

// 5x5 Central Base
const BASE_SIZE = 5;

const BUILDINGS: Record<
  string,
  { width: number; height: number; cost: number; timePerTile: number }
> = {
  house: { width: 2, height: 2, cost: 2000, timePerTile: 2000 },
  workshop: { width: 4, height: 4, cost: 4000, timePerTile: 2000 },
  barracks: { width: 3, height: 3, cost: 4000, timePerTile: 2000 },
};

// Tick & Round timing
const TICK_INTERVAL_MS = 100; // 100ms per tick
const TICKS_PER_ROUND = 50; // 50 ticks = 5 seconds = 1 round

// Movement: 8 ticks to traverse one tile = 800ms per tile
const TICKS_PER_TILE = 8;

// Factory capacity for reservation system
const FACTORY_CAPACITY = 16;

// Spawn interval: 30 seconds for both residents and soldiers
const SPAWN_INTERVAL_MS = 30_000;

// Interface for buildings stored in map
interface Building {
  id: string;
  ownerId: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  health: number;
  constructionEnd?: number;
  captureStart?: number;
  capturingOwnerId?: string;
}

async function eliminatePlayer(
  ctx: any,
  gameId: Id<"games">,
  victimId: Id<"players">,
  conquerorId: Id<"players">
) {
  const victim = await ctx.db.get(victimId);
  const conqueror = await ctx.db.get(conquerorId);
  if (!(victim && conqueror)) return;

  // 1. Transfer Credits
  const loot = victim.credits;
  await ctx.db.patch(conquerorId, { credits: (conqueror.credits || 0) + loot });
  await ctx.db.patch(victimId, {
    credits: 0,
    status: "eliminated",
    eliminatedBy: conquerorId,
  });

  // 2. Transfer Buildings
  const mapDoc = await ctx.db
    .query("maps")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .first();

  if (mapDoc) {
    const newBuildings = mapDoc.buildings.map((b: Building) => {
      if (b.ownerId === victimId) {
        return {
          ...b,
          ownerId: conquerorId,
          captureStart: undefined,
          capturingOwnerId: undefined,
        };
      }
      return b;
    });
    await ctx.db.patch(mapDoc._id, { buildings: newBuildings });
  }

  // 3. Transfer Entities, Families, Troops
  const entities = await ctx.db
    .query("entities")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();

  for (const e of entities) {
    if (e.ownerId === victimId) {
      await ctx.db.patch(e._id, { ownerId: conquerorId });
    }
  }

  const families = await ctx.db
    .query("families")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();
  for (const f of families) {
    if (f.ownerId === victimId) {
      await ctx.db.patch(f._id, { ownerId: conquerorId });
    }
  }

  const troupes = await ctx.db
    .query("troups")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect();
  for (const t of troupes) {
    if (t.ownerId === victimId) {
      await ctx.db.patch(t._id, { ownerId: conquerorId });
    }
  }
}

// Interface for structures (rocks, trees, etc.)
interface Structure {
  x: number;
  y: number;
  type: string;
  width: number;
  height: number;
}

type Entity = {
  _id: Id<"entities">;
  gameId: Id<"games">;
  ownerId: Id<"players">;
  familyId?: Id<"families">;
  troupeId?: Id<"troups">;
  homeId?: string;
  type: string;
  state: string;
  x: number;
  y: number;
  isInside: boolean;
  stateEnd?: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  targetWorkshopId?: string;
  targetHomeId?: string;
  workplaceId?: string;
  lastAttackTime?: number;
  health?: number;
  attackTargetId?: string;
  attackEndTime?: number;
  pathProgress?: number; // 0.0-1.0 progress within current tile
  reservedFactoryId?: string; // Reserved workshop slot
  nextPathAttempt?: number;
};

type Troupe = {
  _id: Id<"troups">;
  gameId: Id<"games">;
  ownerId: Id<"players">;
  barracksId: string;
  targetPos?: { x: number; y: number };
  lastSpawnTime?: number;
  state: string;
};

type Family = {
  _id: Id<"families">;
  gameId: Id<"games">;
  homeId: string;
  ownerId: Id<"players">;
  lastSpawnTime?: number;
};

type Player = {
  _id: Id<"players">;
  gameId: Id<"games">;
  userId?: string;
  credits: number;
  isBot?: boolean;
  status?: string;
};

/**
 * Finds a random position for a base with maximum distance from existing bases.
 * Considers map boundaries, existing buildings, and structures.
 */
function findRandomBasePosition(
  mapWidth: number,
  mapHeight: number,
  buildings: Building[],
  structures: Structure[],
  baseSize: number
): { x: number; y: number } {
  // Collect existing base positions
  const existingBases = buildings.filter((b) => b.type === "base_central");

  // Generate candidate positions
  const NUM_CANDIDATES = 50;
  const candidates: { x: number; y: number; minDistance: number }[] = [];

  for (let i = 0; i < NUM_CANDIDATES; i++) {
    // Random position within map bounds
    const x = Math.floor(Math.random() * (mapWidth - baseSize));
    const y = Math.floor(Math.random() * (mapHeight - baseSize));

    // Check collision with existing buildings
    let collision = false;
    for (const b of buildings) {
      if (
        x < b.x + b.width &&
        x + baseSize > b.x &&
        y < b.y + b.height &&
        y + baseSize > b.y
      ) {
        collision = true;
        break;
      }
    }

    // Check collision with structures
    if (!collision) {
      for (const s of structures) {
        if (
          x < s.x + s.width &&
          x + baseSize > s.x &&
          y < s.y + s.height &&
          y + baseSize > s.y
        ) {
          collision = true;
          break;
        }
      }
    }

    if (collision) {
      continue;
    }

    // Calculate minimum distance to existing bases
    let minDistance = Number.POSITIVE_INFINITY;
    for (const base of existingBases) {
      const centerX = base.x + base.width / 2;
      const centerY = base.y + base.height / 2;
      const candidateCenterX = x + baseSize / 2;
      const candidateCenterY = y + baseSize / 2;
      const distance = Math.sqrt(
        (centerX - candidateCenterX) ** 2 + (centerY - candidateCenterY) ** 2
      );
      minDistance = Math.min(minDistance, distance);
    }

    if (existingBases.length === 0) {
      const mapCenterX = mapWidth / 2;
      const mapCenterY = mapHeight / 2;
      const candidateCenterX = x + baseSize / 2;
      const candidateCenterY = y + baseSize / 2;
      // Prefer positions away from center for variety
      minDistance = Math.sqrt(
        (mapCenterX - candidateCenterX) ** 2 +
          (mapCenterY - candidateCenterY) ** 2
      );
    }

    candidates.push({ x, y, minDistance });
  }

  // If no valid candidates found, fallback to corner positions
  if (candidates.length === 0) {
    const corners = [
      { x: 5, y: 5 },
      { x: mapWidth - baseSize - 5, y: 5 },
      { x: 5, y: mapHeight - baseSize - 5 },
      { x: mapWidth - baseSize - 5, y: mapHeight - baseSize - 5 },
    ];
    // Shuffle and return first free corner
    for (const corner of corners.sort(() => Math.random() - 0.5)) {
      let collision = false;
      for (const b of buildings) {
        if (
          corner.x < b.x + b.width &&
          corner.x + baseSize > b.x &&
          corner.y < b.y + b.height &&
          corner.y + baseSize > b.y
        ) {
          collision = true;
          break;
        }
      }
      if (!collision) {
        return corner;
      }
    }
    // Ultimate fallback
    return { x: 10, y: 10 };
  }

  // Sort by minDistance descending and pick the best one
  candidates.sort((a, b) => b.minDistance - a.minDistance);
  return { x: candidates[0].x, y: candidates[0].y };
}

/**
 * Checks if this is the first building of a specific type for a player.
 */
function isFirstBuildingOfType(
  existingBuildings: any[],
  playerId: string,
  buildingType: string
): boolean {
  return !existingBuildings.some(
    (b) => b.ownerId === playerId && b.type === buildingType
  );
}

function calculateBuildingCost(
  baseCost: number,
  existingBuildings: any[],
  playerId: string,
  buildingType: string,
  playerInflation: number // Player's stored inflation value
): number {
  // First building of each type is free
  if (isFirstBuildingOfType(existingBuildings, playerId, buildingType)) {
    return 0;
  }

  // Use player's stored inflation instead of calculating it
  return Math.floor(baseCost * playerInflation);
}

// --- Helper: Spatial Hash ---

class SpatialHash {
  grid: Map<
    string,
    Array<{ type: string; id: string; x: number; y: number; ownerId: string }>
  >;
  cellSize: number;

  constructor(cellSize: number) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  _key(x: number, y: number) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
  }

  insert(type: string, id: string, x: number, y: number, ownerId: string) {
    const key = this._key(x, y);
    if (!this.grid.has(key)) {
      this.grid.set(key, []);
    }
    this.grid.get(key)?.push({ type, id, x, y, ownerId });
  }

  query(
    x: number,
    y: number,
    radius: number
  ): Array<{
    type: string;
    id: string;
    x: number;
    y: number;
    ownerId: string;
  }> {
    const results: Array<{
      type: string;
      id: string;
      x: number;
      y: number;
      ownerId: string;
    }> = [];
    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minY = Math.floor((y - radius) / this.cellSize);
    const maxY = Math.floor((y + radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const key = `${cx},${cy}`;
        const items = this.grid.get(key);
        if (items) {
          for (const item of items) {
            const dx = item.x - x;
            const dy = item.y - y;
            if (dx * dx + dy * dy <= radius * radius) {
              results.push(item);
            }
          }
        }
      }
    }
    return results;
  }
}

// --- Helper: Unit Update Logic ---
// Generic update for any member (Family, Commander, Soldier)
// workshops and houses parameters are optional - used by family members for work/home cycle
function handleWalking(
  member: Entity,
  now: number,
  workshops?: Building[],
  houses?: Building[]
): boolean {
  if (!member.path || member.path.length === 0) {
    return false;
  }

  const pathLen = member.path.length;
  const currentIndex = member.pathIndex || 0;

  // If we're at or past the end of the path, finalize
  if (currentIndex >= pathLen - 1) {
    const finalPos = member.path[pathLen - 1];
    member.x = finalPos.x;
    member.y = finalPos.y;
    member.path = undefined;
    member.pathIndex = undefined;
    member.pathProgress = undefined;

    if (member.targetWorkshopId && workshops) {
      const workshop = workshops.find((w) => w.id === member.targetWorkshopId);
      if (
        workshop &&
        member.x >= workshop.x - 1 &&
        member.x <= workshop.x + workshop.width &&
        member.y >= workshop.y - 1 &&
        member.y <= workshop.y + workshop.height
      ) {
        member.state = "working";
        member.workplaceId = member.targetWorkshopId;
        member.targetWorkshopId = undefined;
        member.isInside = true;
        member.stateEnd = now + 15_000 + Math.random() * 10_000;
        return true;
      }
      member.targetWorkshopId = undefined;
    }

    if (member.targetHomeId && member.homeId && houses) {
      const home = houses.find((h) => h.id === member.homeId);
      if (
        home &&
        member.x >= home.x - 1 &&
        member.x <= home.x + home.width &&
        member.y >= home.y - 1 &&
        member.y <= home.y + home.height
      ) {
        member.state = "sleeping";
        member.targetHomeId = undefined;
        member.isInside = true;
        member.stateEnd = now + 20_000 + Math.random() * 10_000;
        return true;
      }
      member.targetHomeId = undefined;
    }

    member.state = "idle";
    member.stateEnd = now + 3000 + Math.random() * 3000;
    member.nextPathAttempt = undefined; // Reset backoff
    return true;
  }

  // Progress within current tile (0.0 to 1.0)
  const progress = (member.pathProgress || 0) + 1 / TICKS_PER_TILE;

  if (progress >= 1) {
    // Move to next tile
    const nextIndex = currentIndex + 1;
    member.pathIndex = nextIndex;
    member.pathProgress = progress - 1; // Carry over excess

    if (nextIndex < pathLen) {
      const nextPos = member.path[nextIndex];
      member.x = nextPos.x;
      member.y = nextPos.y;
    }
  } else {
    // Interpolate position between current and next tile
    member.pathProgress = progress;
    const currentPos = member.path[currentIndex];
    const nextPos = member.path[Math.min(currentIndex + 1, pathLen - 1)];
    member.x = currentPos.x + (nextPos.x - currentPos.x) * progress;
    member.y = currentPos.y + (nextPos.y - currentPos.y) * progress;
  }

  member.state = "moving";
  return true;
}

function handleWorking(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  houses?: Building[]
): boolean {
  if (member.state !== "working" || !member.stateEnd || now <= member.stateEnd)
    return false;

  if (member.homeId && houses) {
    const home = houses.find((h) => h.id === member.homeId);
    if (home) {
      const targetX = home.x + Math.floor(home.width / 2);
      const targetY = home.y + home.height;
      const path = findPath(
        { x: member.x, y: member.y },
        {
          x: Math.max(0, Math.min(mapWidth - 1, targetX)),
          y: Math.max(0, Math.min(mapHeight - 1, targetY)),
        },
        mapWidth,
        mapHeight,
        blocked
      );
      if (path && path.length > 0) {
        member.path = path;
        member.pathIndex = 0;
        member.state = "moving";
        member.workplaceId = undefined;
        member.stateEnd = undefined;
        member.targetHomeId = member.homeId;
        return true;
      }
    }
  }
  member.state = "idle";
  member.workplaceId = undefined;
  member.stateEnd = now + 3000 + Math.random() * 3000;
  return true;
}

function handleSleeping(member: Entity, now: number): boolean {
  if (member.state !== "sleeping" || !member.stateEnd || now <= member.stateEnd)
    return false;
  member.state = "idle";
  member.stateEnd = now + 3000 + Math.random() * 3000;
  return true;
}

function handleIdleLogic(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target?: { x: number; y: number },
  workshops?: Building[],
  allEntities?: Entity[],
  isRoundTick?: boolean
): boolean {
  if (target && (member.x !== target.x || member.y !== target.y)) {
    // Check backoff
    if (!member.nextPathAttempt || now >= member.nextPathAttempt) {
      const path = findPath(
        { x: member.x, y: member.y },
        target,
        mapWidth,
        mapHeight,
        blocked
      );
      if (path) {
        member.path = path;
        member.pathIndex = 0;
        member.state = "moving";
        member.nextPathAttempt = undefined; // Success!
        return true;
      }
      // Pathfinding failed: Backoff for 2 seconds
      member.nextPathAttempt = now + 2000;
    }
  }

  if (
    (member.state === "idle" || member.state === "patrol") &&
    (!member.stateEnd || now > member.stateEnd)
  ) {
    // Only family members use factory reservation
    if (
      member.type === "member" &&
      workshops &&
      workshops.length > 0 &&
      allEntities
    ) {
      // Count reservations per factory
      const factoryReservations: Record<string, number> = {};
      for (const e of allEntities) {
        if (e.reservedFactoryId && e.ownerId === member.ownerId) {
          factoryReservations[e.reservedFactoryId] =
            (factoryReservations[e.reservedFactoryId] || 0) + 1;
        }
      }

      // If member has reservation and it's not a reoptimization tick, walk to reserved factory
      if (member.reservedFactoryId && !isRoundTick) {
        const reservedWorkshop = workshops.find(
          (w) => w.id === member.reservedFactoryId
        );
        if (reservedWorkshop && reservedWorkshop.ownerId === member.ownerId) {
          const targetX =
            reservedWorkshop.x + Math.floor(reservedWorkshop.width / 2);
          const targetY = reservedWorkshop.y - 1;
          const path = findPath(
            { x: member.x, y: member.y },
            { x: Math.max(0, targetX), y: Math.max(0, targetY) },
            mapWidth,
            mapHeight,
            blocked
          );
          if (path && path.length > 0) {
            member.path = path;
            member.pathIndex = 0;
            member.state = "moving";
            member.targetWorkshopId = reservedWorkshop.id;
            member.stateEnd = undefined;
            return true;
          }
        } else {
          // Reserved factory no longer valid, clear reservation
          member.reservedFactoryId = undefined;
        }
      }

      // Find best available factory (on round tick, allow reoptimization)
      if (!member.reservedFactoryId || isRoundTick) {
        let bestWorkshop: Building | null = null;
        let bestDist = Number.POSITIVE_INFINITY;

        for (const w of workshops) {
          if (
            (w.constructionEnd && now < w.constructionEnd) ||
            w.ownerId !== member.ownerId
          ) {
            continue;
          }

          // Check capacity (subtract 1 if this member already has this reservation)
          const currentReservations = factoryReservations[w.id] || 0;
          const myReservation = member.reservedFactoryId === w.id ? 1 : 0;
          if (currentReservations - myReservation >= FACTORY_CAPACITY) {
            continue;
          }

          const dist = Math.sqrt(
            (w.x + w.width / 2 - member.x) ** 2 +
              (w.y + w.height / 2 - member.y) ** 2
          );
          if (dist < bestDist) {
            bestDist = dist;
            bestWorkshop = w;
          }
        }

        if (bestWorkshop) {
          // Reserve slot and walk to factory
          member.reservedFactoryId = bestWorkshop.id;
          const targetX = bestWorkshop.x + Math.floor(bestWorkshop.width / 2);
          const targetY = bestWorkshop.y - 1;
          const path = findPath(
            { x: member.x, y: member.y },
            { x: Math.max(0, targetX), y: Math.max(0, targetY) },
            mapWidth,
            mapHeight,
            blocked
          );
          if (path && path.length > 0) {
            member.path = path;
            member.pathIndex = 0;
            member.state = "moving";
            member.targetWorkshopId = bestWorkshop.id;
            member.stateEnd = undefined;
            return true;
          }
        }
      }
    }

    if (Math.random() < 0.4) {
      const isTroop = member.type === "soldier" || member.type === "commander";
      let anchorX = member.x;
      let anchorY = member.y;
      let patrolRadius = 2;

      // Re-thinking: let's use the target if available for troops
      if (isTroop && target) {
        anchorX = target.x;
        anchorY = target.y;
        patrolRadius = 3; // Slightly larger for troops
      }

      const tx = Math.max(
        0,
        Math.min(
          mapWidth - 1,
          anchorX +
            Math.floor(Math.random() * (patrolRadius * 2 + 1)) -
            patrolRadius
        )
      );
      const ty = Math.max(
        0,
        Math.min(
          mapHeight - 1,
          anchorY +
            Math.floor(Math.random() * (patrolRadius * 2 + 1)) -
            patrolRadius
        )
      );
      if (!blocked.has(`${tx},${ty}`) && (tx !== member.x || ty !== member.y)) {
        const path = findPath(
          { x: member.x, y: member.y },
          { x: tx, y: ty },
          mapWidth,
          mapHeight,
          blocked
        );
        if (path && path.length > 1) {
          member.path = path;
          member.pathIndex = 0;
          member.state = "patrol";
          member.stateEnd = undefined;
          return true;
        }
      }
    }
    member.stateEnd = now + 5000 + Math.random() * 5000;
    return true;
  }
  return false;
}

function updateMember(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target?: { x: number; y: number },
  workshops?: Building[],
  houses?: Building[],
  allEntities?: Entity[],
  isRoundTick?: boolean
): boolean {
  if (handleWalking(member, now, workshops, houses)) {
    return true;
  }
  if (handleWorking(member, now, mapWidth, mapHeight, blocked, houses)) {
    return true;
  }
  if (handleSleeping(member, now)) {
    return true;
  }
  if (
    handleIdleLogic(
      member,
      now,
      mapWidth,
      mapHeight,
      blocked,
      target,
      workshops,
      allEntities,
      isRoundTick
    )
  ) {
    return true;
  }
  return false;
}

// --- Tick Helper Functions ---

function categorizeBuildings(buildings: Building[]) {
  const houses: Building[] = [];
  const workshops: Building[] = [];
  const barracks: Building[] = [];

  for (const b of buildings) {
    if (b.type === "house") {
      houses.push(b);
    }
    if (b.type === "workshop") {
      workshops.push(b);
    }
    if (b.type === "barracks") {
      barracks.push(b);
    }
  }
  return { houses, workshops, barracks };
}

async function processActiveEntities(
  ctx: { db: any },
  activeEntities: Entity[],
  troupes: Troupe[],
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  workshops: Building[],
  houses: Building[],
  playerCredits: Record<string, number>,
  spatialHash: SpatialHash,
  entities: Entity[],
  isRoundTick: boolean
) {
  const deletedEntityIds = new Set<string>();

  for (const entity of activeEntities) {
    if (deletedEntityIds.has(entity._id)) continue;

    let dirty = false;
    const troupe = entity.troupeId
      ? troupes.find((t) => t._id === entity.troupeId)
      : undefined;
    const targetPos = troupe?.targetPos;

    // Movement Logic
    if (
      updateMember(
        entity,
        now,
        mapWidth,
        mapHeight,
        blocked,
        targetPos,
        workshops,
        houses,
        entities,
        isRoundTick
      )
    ) {
      dirty = true;
    }

    // Combat Logic (Soldiers Only)
    if (entity.type === "soldier") {
      const COOLDOWN = 1000; // 1 second firing rate
      const RANGE = 10;

      if (!entity.lastAttackTime || now > entity.lastAttackTime + COOLDOWN) {
        const enemies = spatialHash
          .query(entity.x, entity.y, RANGE)
          .filter(
            (e) =>
              e.ownerId !== entity.ownerId &&
              e.type !== "building" &&
              !deletedEntityIds.has(e.id)
          ); // Targeting units only for now? Or buildings too? Prompt says "Units automatically engage enemies within range".

        // Prioritize closest
        let target: { id: string; x: number; y: number } | null = null;
        let minDist = Number.POSITIVE_INFINITY;

        for (const enemy of enemies) {
          const dist = (enemy.x - entity.x) ** 2 + (enemy.y - entity.y) ** 2;
          if (dist < minDist) {
            minDist = dist;
            target = enemy;
          }
        }

        if (target) {
          // Attack
          entity.lastAttackTime = now;
          entity.attackTargetId = target.id;
          entity.attackEndTime = now + 200; // Laser visual duration
          dirty = true;

          // Resolve Hit (Server-side)
          if (Math.random() < 0.8) {
            // High hit prob
            // Find target entity to damage
            const targetEntity = entities.find((e) => e._id === target!.id);
            if (targetEntity && !deletedEntityIds.has(targetEntity._id)) {
              targetEntity.health = (targetEntity.health || 1) - 1;
              // If dead, we handle cleanup later or immediately?
              // Ideally we mark it, but we are iterating activeEntities.
              // Let's just patch it now.
              if (targetEntity.health <= 0) {
                await ctx.db.delete(targetEntity._id);
                deletedEntityIds.add(targetEntity._id);
              } else {
                await ctx.db.patch(targetEntity._id, {
                  health: targetEntity.health,
                });
              }
            }
          }
        }
      }
    }

    // Award working credits only on round ticks (every 50 ticks = 5 seconds)
    if (entity.state === "working" && entity.ownerId && isRoundTick) {
      playerCredits[entity.ownerId] =
        (playerCredits[entity.ownerId] || 0) + 1000;
    }

    // Cleanup attack visuals
    if (entity.attackEndTime && now > entity.attackEndTime) {
      entity.attackTargetId = undefined;
      entity.attackEndTime = undefined;
      dirty = true;
    }

    if (dirty && !deletedEntityIds.has(entity._id)) {
      await ctx.db.patch(entity._id, entity);
    }
  }
}

async function processInsideEntities(
  ctx: any,
  insideEntities: Entity[],
  now: number,
  workshops: Building[],
  houses: Building[],
  playerCredits: Record<string, number>,
  isRoundTick: boolean
) {
  for (const entity of insideEntities) {
    let dirty = false;
    if (entity.stateEnd && now > entity.stateEnd) {
      entity.isInside = false;
      const prevState = entity.state;
      entity.state = "idle";
      entity.stateEnd = undefined;

      if (prevState === "working" && entity.workplaceId) {
        const w = workshops.find((ws) => ws.id === entity.workplaceId);
        if (w) {
          entity.x = w.x + Math.floor(w.width / 2);
          entity.y = w.y + w.height;
        }
      } else if (prevState === "sleeping" && entity.homeId) {
        const h = houses.find((hs) => hs.id === entity.homeId);
        if (h) {
          entity.x = h.x + Math.floor(h.width / 2);
          entity.y = h.y + h.height;
        }
      }
      dirty = true;
    }

    // Award working credits only on round ticks (every 50 ticks = 5 seconds)
    if (entity.state === "working" && entity.ownerId && isRoundTick) {
      playerCredits[entity.ownerId] =
        (playerCredits[entity.ownerId] || 0) + 1000;
    }

    if (dirty) {
      await ctx.db.patch(entity._id, entity);
    }
  }
}

async function handleSpawning(
  ctx: any,
  gameId: Id<"games">,
  now: number,
  houses: Building[],
  barracks: Building[],
  families: Family[],
  troupes: Troupe[],
  entities: Entity[]
) {
  const knownFamilies = new Set(families.map((f) => f.homeId));
  const knownTroops = new Set(troupes.map((t) => t.barracksId));

  for (const b of barracks) {
    if (
      (b.constructionEnd && now < b.constructionEnd) ||
      knownTroops.has(b.id)
    ) {
      continue;
    }

    const troupeId = await ctx.db.insert("troups", {
      gameId,
      barracksId: b.id,
      ownerId: b.ownerId,
      state: "idle",
      targetPos: {
        x: b.x + Math.floor(b.width / 2),
        y: b.y + Math.floor(b.height / 2),
      },
      lastSpawnTime: now, // Initialize spawn timer
    });

    await ctx.db.insert("entities", {
      gameId,
      ownerId: b.ownerId,
      troupeId,
      type: "commander",
      state: "idle",
      x: b.x + 1,
      y: b.y + b.height, // Spawn outside the front
      isInside: false,
    });
    knownTroops.add(b.id);
  }

  for (const h of houses) {
    if (h.constructionEnd && now < h.constructionEnd) continue;
    if (!knownFamilies.has(h.id)) {
      await ctx.db.insert("families", {
        gameId,
        homeId: h.id,
        ownerId: h.ownerId,
        lastSpawnTime: now, // Initialize spawn timer
      });
      knownFamilies.add(h.id);
    }
  }

  // Refresh data for growth logic
  const troupesUpdated = (await ctx.db
    .query("troups")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Troupe[];
  const familiesUpdated = (await ctx.db
    .query("families")
    .withIndex("by_gameId", (q: any) => q.eq("gameId", gameId))
    .collect()) as Family[];

  for (const fam of familiesUpdated) {
    const memberCount = entities.filter((e) => e.familyId === fam._id).length;
    // Only spawn if under capacity AND 30 seconds have passed
    if (memberCount < 4) {
      const lastSpawn = fam.lastSpawnTime || 0;
      if (now > lastSpawn + SPAWN_INTERVAL_MS) {
        const home = houses.find((h) => h.id === fam.homeId);
        if (home) {
          await ctx.db.insert("entities", {
            gameId,
            ownerId: home.ownerId,
            familyId: fam._id,
            homeId: home.id,
            type: "member",
            state: "idle",
            x: home.x,
            y: home.y,
            isInside: false,
          });
          await ctx.db.patch(fam._id, { lastSpawnTime: now });
        }
      }
    }
  }

  for (const troupe of troupesUpdated) {
    const commander = entities.find(
      (e) => e.troupeId === troupe._id && e.type === "commander"
    );

    // Only spawn soldiers if under capacity AND 30 seconds have passed
    // Limit total troupe members (soldiers + commander) to 4
    if (
      commander &&
      entities.filter((e) => e.troupeId === troupe._id).length < 4
    ) {
      const lastSpawn = troupe.lastSpawnTime || 0;
      if (now > lastSpawn + SPAWN_INTERVAL_MS) {
        const offset = {
          x: (Math.random() - 0.5) * 1,
          y: Math.random() * 1,
        };
        const barracksObj = barracks.find((b) => b.id === troupe.barracksId);
        const spawnX = barracksObj ? barracksObj.x + 1 : commander.x;
        const spawnY = barracksObj
          ? barracksObj.y + barracksObj.height
          : commander.y;

        const newSoldier = {
          gameId,
          ownerId: troupe.ownerId,
          troupeId: troupe._id,
          type: "soldier",
          state: "idle",
          x: spawnX + offset.x,
          y: spawnY + offset.y,
          isInside: false,
          health: 10,
        };
        await ctx.db.insert("entities", newSoldier);
        entities.push(newSoldier as any); // Update local array to prevent logic delay
        await ctx.db.patch(troupe._id, { lastSpawnTime: now });
      }
    }
  }
}

export const placeBase = mutation({
  args: {
    gameId: v.id("games"),
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.phase !== "placement") {
      throw new Error("Not in placement phase");
    }

    const player = await ctx.db
      .query("players")
      .filter((q) =>
        q.and(
          q.eq(q.field("gameId"), args.gameId),
          q.eq(q.field("userId"), identity.subject)
        )
      )
      .first();

    if (!player) throw new Error("Player not found in this game");

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    if (
      args.x < 0 ||
      args.x + BASE_SIZE > map.width ||
      args.y < 0 ||
      args.y + BASE_SIZE > map.height
    ) {
      throw new Error("Out of bounds");
    }

    // Remove existing base from this player (if any) to allow repositioning
    const buildingsWithoutMyBase = map.buildings.filter(
      (b) => !(b.ownerId === player._id && b.type === "base_central")
    );

    // Check collision with OTHER buildings only (not own base)
    for (const b of buildingsWithoutMyBase) {
      if (
        args.x < b.x + b.width &&
        args.x + BASE_SIZE > b.x &&
        args.y < b.y + b.height &&
        args.y + BASE_SIZE > b.y
      ) {
        throw new Error("Collides with another building");
      }
    }

    const newBuilding = {
      id: Math.random().toString(36).slice(2),
      ownerId: player._id,
      type: "base_central",
      x: args.x,
      y: args.y,
      width: BASE_SIZE,
      height: BASE_SIZE,
      health: 1000,
    };

    // Add new base to filtered list (without old base)
    const newBuildings = [...buildingsWithoutMyBase, newBuilding];

    await ctx.db.patch(map._id, {
      buildings: newBuildings,
    });

    await ctx.db.patch(player._id, {
      hasPlacedBase: true,
    });

    return { success: true, building: newBuilding };
  },
});

export const placeBuilding = mutation({
  args: {
    gameId: v.id("games"),
    buildingType: v.string(), // "house", "workshop", "barracks"
    x: v.number(),
    y: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const game = await ctx.db.get(args.gameId);
    if (!game) throw new Error("Game not found");

    if (game.phase !== "simulation") {
      throw new Error("Build mode only available in simulation phase");
    }

    const buildingSpec = BUILDINGS[args.buildingType];
    if (!buildingSpec) throw new Error("Invalid building type");

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

    const map = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();

    if (!map) throw new Error("Map not generated");

    const cost = calculateBuildingCost(
      buildingSpec.cost,
      map.buildings,
      player._id,
      args.buildingType,
      player.inflation || 1.0 // Pass player's stored inflation
    );

    if ((player.credits || 0) < cost) {
      throw new Error("Not enough credits");
    }

    if (
      args.x < 0 ||
      args.x + buildingSpec.width > map.width ||
      args.y < 0 ||
      args.y + buildingSpec.height > map.height
    ) {
      throw new Error("Out of bounds");
    }

    // Energy Field Check
    // Rule: Center-to-center distance <= 4 + (ExistingSize/2 + NewSize/2)
    // effectively: Edge-to-edge distance <= 4
    let inEnergyField = false;
    const myBuildings = map.buildings.filter((b) => b.ownerId === player._id);

    // If player has no buildings (e.g. wiped out or first build?), we might skip this.
    // But usually they have a base. If they have 0 buildings, maybe allow placement?
    // Assuming strictly > 0 for standard gameplay.
    if (myBuildings.length === 0) {
      inEnergyField = true;
    } else {
      const newCX = args.x + buildingSpec.width / 2;
      const newCY = args.y + buildingSpec.height / 2;
      const newRadius = Math.max(buildingSpec.width, buildingSpec.height) / 2; // Approx radius

      for (const b of myBuildings) {
        const bCX = b.x + b.width / 2;
        const bCY = b.y + b.height / 2;
        const bRadius = Math.max(b.width, b.height) / 2;

        const dist = Math.sqrt((newCX - bCX) ** 2 + (newCY - bCY) ** 2);
        const maxDist = 4 + bRadius + newRadius;

        if (dist <= maxDist) {
          inEnergyField = true;
          break;
        }
      }
    }

    if (!inEnergyField) {
      throw new Error(
        "Must place within 4-tile energy field of existing buildings"
      );
    }

    for (const b of map.buildings) {
      const noOverlap =
        args.x >= b.x + b.width + 1 ||
        args.x + buildingSpec.width + 1 <= b.x ||
        args.y >= b.y + b.height + 1 ||
        args.y + buildingSpec.height + 1 <= b.y;

      if (!noOverlap) {
        throw new Error(
          "Cannot place here: overlapping or too close to another building"
        );
      }
    }

    // Check collision with structures
    if (map.structures) {
      const structures = map.structures as Structure[];
      for (const s of structures) {
        const noOverlap =
          args.x >= s.x + s.width || // Structures don't need +1 buffer usually, but let's be safe? standard collision is non-inclusive
          args.x + buildingSpec.width <= s.x ||
          args.y >= s.y + s.height ||
          args.y + buildingSpec.height <= s.y;

        if (!noOverlap) {
          throw new Error("Cannot place here: blocked by structure");
        }
      }
    }

    // Deduct credits and update inflation
    if (cost > 0) {
      // Non-free building: deduct cost and double inflation
      const currentInflation = player.inflation || 1.0;
      await ctx.db.patch(player._id, {
        credits: (player.credits || 0) - cost,
        inflation: currentInflation * 2, // Double inflation on each build
      });
    } else {
      // Free building (first of type): only deduct credits (0), inflation stays 1.0
      await ctx.db.patch(player._id, {
        credits: (player.credits || 0) - cost,
      });
    }

    const totalTiles = buildingSpec.width * buildingSpec.height;
    const durationMs = totalTiles * buildingSpec.timePerTile;
    const constructionEnd = Date.now() + durationMs;

    const newBuilding = {
      id: Math.random().toString(36).slice(2),
      ownerId: player._id,
      type: args.buildingType,
      x: args.x,
      y: args.y,
      width: buildingSpec.width,
      height: buildingSpec.height,
      health: 100,
      constructionEnd,
    };

    const newBuildings = [...map.buildings, newBuilding];

    await ctx.db.patch(map._id, {
      buildings: newBuildings,
    });

    return { success: true, building: newBuilding, cost };
  },
});

export const endPlacementPhase = internalMutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return;
    }

    if (game.phase === "placement") {
      // Get all players and map
      const players = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), args.gameId))
        .collect();

      const map = await ctx.db
        .query("maps")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .first();

      if (!map) {
        return;
      }

      // Find players who haven't placed their base
      const playersWithoutBase = players.filter((p) => !p.hasPlacedBase);

      // Auto-place bases for all players who haven't placed
      // We do this sequentially so each new base is considered for next placement
      const currentBuildings = [...map.buildings] as Building[];

      for (const player of playersWithoutBase) {
        // Find optimal position with maximum distance from existing bases
        const position = findRandomBasePosition(
          map.width,
          map.height,
          currentBuildings,
          map.structures as Structure[],
          BASE_SIZE
        );

        // Create new base building
        const newBuilding: Building = {
          id: Math.random().toString(36).slice(2),
          ownerId: player._id,
          type: "base_central",
          x: position.x,
          y: position.y,
          width: BASE_SIZE,
          height: BASE_SIZE,
          health: 1000,
        };

        // Add to current buildings (for next iteration)
        currentBuildings.push(newBuilding);

        // Mark player as having placed base
        await ctx.db.patch(player._id, {
          hasPlacedBase: true,
        });
      }

      // Save all new buildings to map
      if (playersWithoutBase.length > 0) {
        await ctx.db.patch(map._id, {
          buildings: currentBuildings,
        });
      }

      // Transition to simulation phase
      await ctx.db.patch(game._id, {
        phase: "simulation",
        phaseStart: Date.now(),
        phaseEnd: Date.now() + 30 * 60 * 1000, // 30 Minutes
      });

      await ctx.scheduler.runAfter(0, internal.game.tick, { gameId: game._id });
    }
  },
});

export const tick = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game || game.status !== "active" || game.phase !== "simulation")
      return;

    const now = Date.now();

    // Track tick count for round-based economy
    const tickCount = (game.tickCount || 0) + 1;
    const isRoundTick = tickCount % TICKS_PER_ROUND === 0;
    await ctx.db.patch(game._id, { tickCount });

    // 1.0 Inflation Decay (every round, reduce by 0.1 down to min 1.0)
    if (isRoundTick) {
      const players = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), args.gameId))
        .collect();

      for (const player of players) {
        const currentInflation = player.inflation || 1.0;
        if (currentInflation > 1.0) {
          const newInflation = Math.max(1.0, currentInflation - 0.1);
          await ctx.db.patch(player._id, { inflation: newInflation });
        }
      }
    }

    // 1. Timer & End Game Check
    if (game.phaseEnd && now > game.phaseEnd) {
      await ctx.db.patch(game._id, { status: "ended" });
      return;
    }

    // 1.1 Victory Check (Auto-End if 1 player left)
    // Only check if game is active
    if (game.status === "active" && game.phase === "simulation") {
      const allPlayers = await ctx.db
        .query("players")
        .filter((q) => q.eq(q.field("gameId"), args.gameId))
        .collect();
      const activePlayers = allPlayers.filter(
        (p) => !p.status || p.status === "active"
      );

      if (activePlayers.length <= 1 && allPlayers.length > 1) {
        // Ensure >1 total players so solo testing doesn't instant-end
        await ctx.db.patch(game._id, { status: "ended" });
        return;
      }
    }

    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!mapDoc) return;

    const entities = (await ctx.db
      .query("entities")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect()) as Entity[];

    // 2. Capture Logic
    let mapDirty = false;
    const pendingEliminations: {
      victimId: Id<"players">;
      conquerorId: Id<"players">;
    }[] = [];

    // Filter units that can capture (e.g. soldiers, commanders)
    const combatUnits = entities.filter(
      (e) => (e.type === "soldier" || e.type === "commander") && !e.isInside
    );

    for (const b of mapDoc.buildings) {
      if (b.type === "base_central") {
        // Find enemy units near base (1 tile range = distance < 2? No, 1 tile means adjacent)
        // Base is 5x5. Units at x,y.
        // Base Zone: x to x+width, y to y+height.
        // Range 1 means: x-1 to x+width+1, y-1 to y+height+1.

        let capturingPlayerId: string | null = null;
        let ownerDefending = false;

        // Check for units in range
        for (const unit of combatUnits) {
          if (
            unit.x >= b.x - 1 &&
            unit.x <= b.x + b.width && // x + width is exclusive usually, but let's be generous: <= x+width is effectively +1 tile right
            unit.y >= b.y - 1 &&
            unit.y <= b.y + b.height
          ) {
            if (unit.ownerId === b.ownerId) {
              ownerDefending = true;
            } else {
              // Found enemy
              // If multiple enemies from different teams, first one found wins priority?
              // Simplifying: Last one found sets capturing ID, or we check distinct teams.
              // For now, assume first enemy detected starts capture.
              if (!capturingPlayerId) capturingPlayerId = unit.ownerId;
            }
          }
        }

        if (capturingPlayerId && !ownerDefending) {
          // Capture in progress
          if (b.capturingOwnerId === capturingPlayerId) {
            // Continue capture
            if (b.captureStart && now - b.captureStart >= 30_000) {
              // Trigger Elimination
              pendingEliminations.push({
                victimId: b.ownerId as Id<"players">,
                conquerorId: capturingPlayerId as Id<"players">,
              });
              b.captureStart = undefined;
              b.capturingOwnerId = undefined;
              mapDirty = true;
            }
          } else {
            // Start new capture
            b.capturingOwnerId = capturingPlayerId;
            b.captureStart = now;
            mapDirty = true;
          }
        } else {
          // Reset if defended or no enemies
          if (b.captureStart || b.capturingOwnerId) {
            b.captureStart = undefined;
            b.capturingOwnerId = undefined;
            mapDirty = true;
          }
        }
      }
    }

    if (mapDirty) {
      await ctx.db.patch(mapDoc._id, { buildings: mapDoc.buildings });
    }

    const players = (await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect()) as Player[];
    const families = (await ctx.db
      .query("families")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect()) as Family[];
    const troupes = (await ctx.db
      .query("troups")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect()) as Troupe[];

    const playerCredits: Record<string, number> = {};
    for (const p of players) playerCredits[p._id] = 0;

    const blocked = createCollisionMap(
      mapDoc.width,
      mapDoc.height,
      mapDoc.buildings
    );
    const { houses, workshops, barracks } = categorizeBuildings(
      mapDoc.buildings
    );

    // Build Spatial Hash
    const spatialHash = new SpatialHash(10); // 10x10 chunks
    for (const e of entities) {
      if (!e.isInside) {
        spatialHash.insert(e.type, e._id, e.x, e.y, e.ownerId);
      }
    }
    // Add buildings to hash? Prompt says units engage enemies.
    // If we want them to attack buildings, we should add buildings too.
    // For now, let's stick to units attacking units as primary combat.

    await processActiveEntities(
      ctx,
      entities.filter((e) => !e.isInside),
      troupes,
      now,
      mapDoc.width,
      mapDoc.height,
      blocked,
      workshops,
      houses,
      playerCredits,
      spatialHash,
      entities,
      isRoundTick
    );
    await processInsideEntities(
      ctx,
      entities.filter((e) => e.isInside),
      now,
      workshops,
      houses,
      playerCredits,
      isRoundTick
    );
    await handleSpawning(
      ctx,
      args.gameId,
      now,
      houses,
      barracks,
      families,
      troupes,
      entities
    );

    for (const p of players) {
      const gain = playerCredits[p._id] || 0;
      if (gain > 0) {
        await ctx.db.patch(p._id, { credits: (p.credits || 0) + gain });
      }
    }

    // Execute Pending Eliminations
    for (const elim of pendingEliminations) {
      await eliminatePlayer(ctx, args.gameId, elim.victimId, elim.conquerorId);
    }

    await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.game.tick, {
      gameId: args.gameId,
    });
  },
});

export const deleteGame = mutation({
  args: {
    gameId: v.id("games"),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) return;

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();
    for (const p of players) await ctx.db.delete(p._id);

    const teams = await ctx.db
      .query("teams")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();
    for (const t of teams) await ctx.db.delete(t._id);

    const maps = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const m of maps) await ctx.db.delete(m._id);

    const mapChunks = await ctx.db
      .query("chunks")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const c of mapChunks) await ctx.db.delete(c._id);

    const entities = await ctx.db
      .query("entities")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const e of entities) await ctx.db.delete(e._id);

    const families = await ctx.db
      .query("families")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const f of families) await ctx.db.delete(f._id);

    const troupes = await ctx.db
      .query("troups")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .collect();
    for (const t of troupes) await ctx.db.delete(t._id);

    await ctx.db.delete(game._id);
  },
});

export const getGameState = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId);
    if (!game) {
      return null;
    }

    const players = await ctx.db
      .query("players")
      .filter((q) => q.eq(q.field("gameId"), args.gameId))
      .collect();

    let buildings: any[] = [];
    let planetType = "";
    let entities: any[] = [];
    let families: any[] = [];
    let troupes: any[] = [];

    if (game.phase !== "lobby") {
      const mapDoc = await ctx.db
        .query("maps")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .first();
      if (mapDoc) {
        buildings = mapDoc.buildings;
        planetType = mapDoc.planetType;
      }
      entities = await ctx.db
        .query("entities")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
      families = await ctx.db
        .query("families")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
      troupes = await ctx.db
        .query("troups")
        .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
        .collect();
    }

    return {
      game,
      players,
      buildings,
      planetType,
      entities,
      families,
      troupes,
    };
  },
});

export const getStaticMap = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const mapDoc = await ctx.db
      .query("maps")
      .withIndex("by_gameId", (q) => q.eq("gameId", args.gameId))
      .first();
    if (!mapDoc) return null;

    // Load all chunks - frontend will reassemble
    const chunks = await ctx.db
      .query("chunks")
      .withIndex("by_game", (q) => q.eq("gameId", args.gameId))
      .collect();

    return {
      _id: mapDoc._id,
      width: mapDoc.width,
      height: mapDoc.height,
      planetType: mapDoc.planetType,
      chunks, // Return chunks, not reassembled tiles
      structures: mapDoc.structures,
    };
  },
});

export const moveTroop = mutation({
  args: {
    gameId: v.id("games"),
    troupeId: v.id("troups"),
    targetX: v.number(),
    targetY: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const troupe = await ctx.db.get(args.troupeId);
    if (!troupe) throw new Error("Troop not found");

    // Check ownership
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

    if (troupe.ownerId !== player._id) throw new Error("Not your troop");

    // Update Target
    await ctx.db.patch(troupe._id, {
      targetPos: { x: args.targetX, y: args.targetY },
      state: "moving",
    });

    // Reset members to ensure they pathfind
    const members = await ctx.db
      .query("entities")
      .withIndex("by_troupeId", (q) => q.eq("troupeId", troupe._id))
      .collect();

    for (const member of members) {
      await ctx.db.patch(member._id, {
        state: "idle",
        path: undefined,
        pathIndex: undefined,
        nextPathAttempt: undefined, // Reset backoff so they react immediately
      });
    }
  },
});
