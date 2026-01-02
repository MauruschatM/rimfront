import type { MutationCtx } from "../_generated/server";
import { FACTORY_CAPACITY, TICKS_PER_TILE } from "./constants";
import { findPath } from "./pathfinding";
import type { Building, Entity } from "./types";

function checkPathCompletion(
  member: Entity,
  now: number,
  workshops?: Building[],
  houses?: Building[]
): boolean {
  if (!member.path) return false;

  const pathLen = member.path.length;
  const finalPos = member.path[pathLen - 1];

  if (finalPos) {
    member.x = finalPos.x;
    member.y = finalPos.y;
  }
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

function handleMovementInterpolation(member: Entity): void {
  const pathLen = member.path?.length || 0;
  const currentIndex = member.pathIndex || 0;

  // Progress within current tile (0.0 to 1.0)
  const progress = (member.pathProgress || 0) + 1 / TICKS_PER_TILE;

  if (progress >= 1) {
    // Move to next tile
    const nextIndex = currentIndex + 1;
    member.pathIndex = nextIndex;
    member.pathProgress = progress - 1; // Carry over excess

    if (nextIndex < pathLen && member.path) {
      const nextPos = member.path[nextIndex];
      if (nextPos) {
        member.x = nextPos.x;
        member.y = nextPos.y;
      }
    }
  } else {
    // Interpolate position between current and next tile
    member.pathProgress = progress;
    if (member.path) {
      const currentPos = member.path[currentIndex];
      const nextPos = member.path[Math.min(currentIndex + 1, pathLen - 1)];
      if (currentPos && nextPos) {
        member.x = currentPos.x + (nextPos.x - currentPos.x) * progress;
        member.y = currentPos.y + (nextPos.y - currentPos.y) * progress;
      }
    }
  }

  member.state = "moving";
}

// Generic update for any member (Family, Commander, Soldier)
// workshops and houses parameters are optional - used by family members for work/home cycle
export function handleWalking(
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
    return checkPathCompletion(member, now, workshops, houses);
  }

  handleMovementInterpolation(member);
  return true;
}

export function handleWorking(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  houses?: Building[]
): boolean {
  if (
    member.state !== "working" ||
    !member.stateEnd ||
    now <= member.stateEnd
  ) {
    return false;
  }

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

export function handleSleeping(member: Entity, now: number): boolean {
  if (
    member.state !== "sleeping" ||
    !member.stateEnd ||
    now <= member.stateEnd
  ) {
    return false;
  }
  member.state = "idle";
  member.stateEnd = now + 3000 + Math.random() * 3000;
  return true;
}

function handlePathRequest(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target: { x: number; y: number }
): boolean {
  if (member.x === target.x && member.y === target.y) return false;

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
  return false;
}

function assignFactoryJob(
  member: Entity,
  workshops: Building[],
  allEntities: Entity[],
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  isRoundTick: boolean,
  now: number
): boolean {
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
  return false;
}

function handleRandomPatrol(
  member: Entity,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target?: { x: number; y: number }
): boolean {
  if (Math.random() >= 0.4) return false;

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
  return false;
}

export function handleIdleLogic(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target?: { x: number; y: number },
  workshops?: Building[],
  allEntities?: Entity[],
  isRoundTick?: boolean,
  isConfused?: boolean
): boolean {
  // If confused (betrayal penalty), ignore user orders and just wander randomly
  const effectiveTarget = isConfused ? undefined : target;

  if (
    effectiveTarget &&
    handlePathRequest(
      member,
      now,
      mapWidth,
      mapHeight,
      blocked,
      effectiveTarget
    )
  ) {
    return true;
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
      allEntities &&
      assignFactoryJob(
        member,
        workshops,
        allEntities,
        mapWidth,
        mapHeight,
        blocked,
        !!isRoundTick,
        now
      )
    ) {
      return true;
    }

    if (handleRandomPatrol(member, mapWidth, mapHeight, blocked, target)) {
      return true;
    }

    member.stateEnd = now + 5000 + Math.random() * 5000;
    return true;
  }
  return false;
}

export function updateMember(
  member: Entity,
  now: number,
  mapWidth: number,
  mapHeight: number,
  blocked: Set<string>,
  target?: { x: number; y: number },
  workshops?: Building[],
  houses?: Building[],
  allEntities?: Entity[],
  isRoundTick?: boolean,
  isConfused?: boolean
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
      isRoundTick,
      isConfused
    )
  ) {
    return true;
  }
  return false;
}

export function categorizeBuildings(buildings: Building[]) {
  const houses: Building[] = [];
  const workshops: Building[] = [];
  const barracks: Building[] = [];
  const turrets: Building[] = [];
  const walls: Building[] = [];

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
    if (b.type === "turret") {
      turrets.push(b);
    }
    if (b.type === "wall") {
      walls.push(b);
    }
  }
  return { houses, workshops, barracks, turrets, walls };
}

export async function processInsideEntities(
  ctx: MutationCtx,
  insideEntities: Entity[],
  now: number,
  workshops: Building[],
  houses: Building[],
  playerCredits: Record<string, number>,
  isRoundTick: boolean,
  poweredBuildingIds: Set<string>
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
    // AND if workplace is powered
    if (
      entity.state === "working" &&
      entity.ownerId &&
      isRoundTick &&
      entity.workplaceId &&
      poweredBuildingIds.has(entity.workplaceId)
    ) {
      playerCredits[entity.ownerId] =
        (playerCredits[entity.ownerId] || 0) + 1000;
    }

    if (dirty) {
      await ctx.db.patch(entity._id, entity);
    }
  }
}
