import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import type { SpatialHash } from "./spatial";
import type { Building, Entity } from "./types";

// --------------------------------------------------------------------------
// DESTRUCTION LOGIC
// --------------------------------------------------------------------------

/**
 * Handles the cleanup of destroyed buildings.
 * - Identifies buildings with health <= 0
 * - Deletes associated entities (e.g., turret guns) from the DB
 * - Updates the map with the surviving buildings
 *
 * @param ctx Convex mutation context
 * @param mapDoc The map document from the database
 * @param entities All active entities in the game
 * @returns {Promise<{ survivors: Building[], destroyedIds: Set<string>, mapSaved: boolean }>}
 *          - survivors: The list of remaining buildings
 *          - destroyedIds: Set of IDs of buildings that were destroyed
 *          - mapSaved: Boolean indicating if the map was patched in the DB
 */
export async function cleanupDestroyedBuildings(
  ctx: MutationCtx,
  mapDoc: Doc<"maps">,
  entities: Entity[]
): Promise<{
  survivors: Building[];
  destroyedIds: Set<string>;
  mapSaved: boolean;
}> {
  const survivors: Building[] = [];
  const destroyedIds = new Set<string>();
  let buildingCountChanged = false;

  const buildings = mapDoc.buildings as Building[];

  for (const b of buildings) {
    if (b.health !== undefined && b.health <= 0 && b.type !== "base_central") {
      destroyedIds.add(b.id);
      buildingCountChanged = true;
    } else {
      survivors.push(b);
    }
  }

  let mapSaved = false;

  if (buildingCountChanged) {
    // Cleanup entities linked to destroyed buildings
    for (const id of destroyedIds) {
      const linked = entities.filter((e) => e.buildingId === id);
      for (const e of linked) {
        await ctx.db.delete(e._id);
      }
    }

    // Save new building list
    // Update local object immediately as well (though it's a prop, we can't mutate it easily without a cast or re-assign)
    // mapDoc.buildings = survivors; // This might be read-only in some generated types, but typically mutable in JS
    await ctx.db.patch(mapDoc._id, { buildings: survivors });
    mapSaved = true;
  }

  return { survivors, destroyedIds, mapSaved };
}

// --------------------------------------------------------------------------
// POWER / ENERGY SYSTEM
// --------------------------------------------------------------------------

/**
 * Calculates which buildings are powered.
 * A building is powered if it is part of a cluster connected to a Base Central.
 * Connection is defined by an overlap or proximity <= 4 tiles.
 *
 * @param buildings All buildings in the map
 * @returns Set of Building IDs that are powered
 */
export function calculatePoweredBuildings(buildings: Building[]): Set<string> {
  const poweredIds = new Set<string>();
  const buildingsByOwner: Record<string, Building[]> = {};

  // Group by owner
  for (const b of buildings) {
    if (!buildingsByOwner[b.ownerId]) {
      buildingsByOwner[b.ownerId] = [];
    }
    const ownerBuildings = buildingsByOwner[b.ownerId];
    if (ownerBuildings) {
      ownerBuildings.push(b);
    }
  }

  // For each owner, find connected components starting from Base Central
  for (const ownerId in buildingsByOwner) {
    const playerBuildings = buildingsByOwner[ownerId] ?? [];
    const queue: Building[] = [];
    const visited = new Set<string>();

    // 1. Initialize queue with all Central Bases
    for (const b of playerBuildings) {
      if (b.type === "base_central") {
        queue.push(b);
        visited.add(b.id);
        poweredIds.add(b.id);
      }
    }

    // 2. BFS
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;
      const cx = current.x + current.width / 2;
      const cy = current.y + current.height / 2;
      const cRadius = Math.max(current.width, current.height) / 2;

      for (const next of playerBuildings) {
        if (visited.has(next.id)) continue;

        const nx = next.x + next.width / 2;
        const ny = next.y + next.height / 2;
        const nRadius = Math.max(next.width, next.height) / 2;

        const dist = Math.sqrt((cx - nx) ** 2 + (cy - ny) ** 2);
        const maxDist = 4 + cRadius + nRadius; // Energy field rule

        if (dist <= maxDist) {
          visited.add(next.id);
          poweredIds.add(next.id);
          queue.push(next);
        }
      }
    }
  }

  return poweredIds;
}

// --------------------------------------------------------------------------
// CAPTURE LOGIC
// --------------------------------------------------------------------------

const CAPTURE_TIME_BASE = 30_000;
const CAPTURE_TIME_BUILDING = 5000;

export interface CaptureEvent {
  buildingId: string;
  victimId: string; // The previous owner
  conquerorId: string; // The new owner
  isBase: boolean;
}

/**
 * Processes capture logic for all buildings.
 * Returns a list of "CaptureEvents" that just completed this tick.
 * The function mutates the `buildings` array in-place (updating capture timers).
 *
 * @param buildings List of buildings
 * @param spatialHash SpatialHash containing active entities (soldiers/commanders)
 * @param now Current timestamp
 * @returns Array of events for buildings that finished capturing this tick
 */
export function handleCapture(
  buildings: Building[],
  spatialHash: SpatialHash,
  now: number
): CaptureEvent[] {
  const completedCaptures: CaptureEvent[] = [];

  for (const b of buildings) {
    // Determine range
    // Base is 5x5, others 2x2, 3x3 etc.
    // Check range: adjacent (1 tile buffer)
    let capturingPlayerId: string | null = null;
    let ownerDefending = false;

    // Use SpatialHash to find units near the building
    // Calculate center and radius to cover the building + 1 tile buffer
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    // Radius must cover the corners. Distance from center to corner of (width+2, height+2) box.
    // Half dimensions: (w+2)/2, (h+2)/2
    const radius =
      Math.sqrt(((b.width + 2) / 2) ** 2 + ((b.height + 2) / 2) ** 2) + 0.5;

    const nearbyUnits = spatialHash.query(cx, cy, radius);

    for (const unit of nearbyUnits) {
      // Filter for soldiers/commanders that are NOT inside (spatial hash usually excludes inside units)
      if (unit.type !== "soldier" && unit.type !== "commander") continue;

      // Precise box check
      if (
        unit.x >= b.x - 1 &&
        unit.x <= b.x + b.width &&
        unit.y >= b.y - 1 &&
        unit.y <= b.y + b.height
      ) {
        if (unit.ownerId === b.ownerId) {
          ownerDefending = true;
        } else {
          // Found enemy
          if (!capturingPlayerId) capturingPlayerId = unit.ownerId;
        }
      }
    }

    if (capturingPlayerId && !ownerDefending) {
      // Capture in progress
      if (b.capturingOwnerId === capturingPlayerId) {
        // Continue capture
        const requiredTime =
          b.type === "base_central" ? CAPTURE_TIME_BASE : CAPTURE_TIME_BUILDING;

        if (b.captureStart && now - b.captureStart >= requiredTime) {
          // Capture Complete!
          completedCaptures.push({
            buildingId: b.id,
            victimId: b.ownerId,
            conquerorId: capturingPlayerId,
            isBase: b.type === "base_central",
          });

          // Reset capture state on building (will be updated by caller when transferring ownership)
          b.captureStart = undefined;
          b.capturingOwnerId = undefined;
        }
      } else {
        // Start new capture
        b.capturingOwnerId = capturingPlayerId;
        b.captureStart = now;
      }
    } else {
      // Reset if defended or no enemies
      if (b.captureStart || b.capturingOwnerId) {
        b.captureStart = undefined;
        b.capturingOwnerId = undefined;
      }
    }
  }

  return completedCaptures;
}

// --------------------------------------------------------------------------
// OWNERSHIP TRANSFER
// --------------------------------------------------------------------------

/**
 * Transfers ownership of a building and all its associated units/groups.
 */
export async function transferOwnership(
  ctx: MutationCtx,
  gameId: Id<"games">,
  buildingId: string,
  newOwnerId: Id<"players">
) {
  // 1. Update Building in Map (This must be done by the caller usually to save DB reads,
  //    but if we want atomic update here we can fetch map).
  //    However, `handleCapture` already modified the local `buildings` array.
  //    So the caller `tick` function will save the map.
  //    We only need to update the UNITS and GROUPS here.

  // 2. Transfer Family (House)
  const family = await ctx.db
    .query("families")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .filter((q) => q.eq(q.field("homeId"), buildingId))
    .first();

  if (family) {
    await ctx.db.patch(family._id, { ownerId: newOwnerId });
    // Transfer all members
    const members = await ctx.db
      .query("entities")
      .withIndex("by_familyId", (q) => q.eq("familyId", family._id))
      .collect();
    for (const m of members) {
      await ctx.db.patch(m._id, { ownerId: newOwnerId });
    }
  }

  // 3. Transfer Troop (Barracks)
  const troop = await ctx.db
    .query("troops")
    .withIndex("by_gameId", (q) => q.eq("gameId", gameId))
    .filter((q) => q.eq(q.field("barracksId"), buildingId))
    .first();

  if (troop) {
    await ctx.db.patch(troop._id, { ownerId: newOwnerId });
    // Transfer all soldiers
    const soldiers = await ctx.db
      .query("entities")
      .withIndex("by_troopId", (q) => q.eq("troopId", troop._id))
      .collect();
    for (const s of soldiers) {
      await ctx.db.patch(s._id, { ownerId: newOwnerId });
    }
  }
}
