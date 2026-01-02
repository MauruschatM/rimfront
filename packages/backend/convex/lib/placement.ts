import type { Building, Structure } from "./types";

/**
 * Finds a random position for a base with maximum distance from existing bases.
 * Considers map boundaries, existing buildings, and structures.
 */
export function findRandomBasePosition(
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
    const candidate = generateCandidate(
      mapWidth,
      mapHeight,
      baseSize,
      buildings,
      structures,
      existingBases
    );
    if (candidate) {
      candidates.push(candidate);
    }
  }

  // If no valid candidates found, fallback to corner positions
  if (candidates.length === 0) {
    return findFallbackPosition(mapWidth, mapHeight, baseSize, buildings);
  }

  // Sort by minDistance descending and pick the best one
  candidates.sort((a, b) => b.minDistance - a.minDistance);
  const best = candidates[0];
  // best is defined here because length > 0
  return { x: best.x, y: best.y };
}

function generateCandidate(
  mapWidth: number,
  mapHeight: number,
  baseSize: number,
  buildings: Building[],
  structures: Structure[],
  existingBases: Building[]
): { x: number; y: number; minDistance: number } | null {
  // Random position within map bounds
  const x = Math.floor(Math.random() * (mapWidth - baseSize));
  const y = Math.floor(Math.random() * (mapHeight - baseSize));

  if (checkCollision(x, y, baseSize, baseSize, buildings, structures)) {
    return null;
  }

  // Calculate minimum distance to existing bases
  let minDistance = Number.POSITIVE_INFINITY;
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
  } else {
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
  }

  return { x, y, minDistance };
}

function findFallbackPosition(
  mapWidth: number,
  mapHeight: number,
  baseSize: number,
  buildings: Building[]
): { x: number; y: number } {
  const corners = [
    { x: 5, y: 5 },
    { x: mapWidth - baseSize - 5, y: 5 },
    { x: 5, y: mapHeight - baseSize - 5 },
    { x: mapWidth - baseSize - 5, y: mapHeight - baseSize - 5 },
  ];
  // Shuffle and return first free corner
  for (const corner of corners.sort(() => Math.random() - 0.5)) {
    if (
      !checkCollision(corner.x, corner.y, baseSize, baseSize, buildings, [])
    ) {
      return corner;
    }
  }
  // Ultimate fallback
  return { x: 10, y: 10 };
}

function checkCollision(
  x: number,
  y: number,
  width: number,
  height: number,
  buildings: Building[],
  structures: Structure[] | undefined
): boolean {
  for (const b of buildings) {
    if (
      x < b.x + b.width &&
      x + width > b.x &&
      y < b.y + b.height &&
      y + height > b.y
    ) {
      return true;
    }
  }

  if (structures) {
    for (const s of structures) {
      if (
        x < s.x + s.width &&
        x + width > s.x &&
        y < s.y + s.height &&
        y + height > s.y
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Validates if a building can be placed at the specified location.
 * Checks for:
 * 1. Map bounds
 * 2. Energy field (must be near own buildings)
 * 3. Overlap with other buildings
 * 4. Overlap with structures
 *
 * @throws Error if placement is invalid
 */
export function validateBuildingPlacement(
  x: number,
  y: number,
  width: number,
  height: number,
  mapWidth: number,
  mapHeight: number,
  buildings: Building[],
  structures: Structure[] | undefined,
  myBuildings: Building[]
): void {
  validateBounds(x, y, width, height, mapWidth, mapHeight);
  validateEnergyField(x, y, width, height, myBuildings);
  validateBuildingOverlap(x, y, width, height, buildings);
  validateStructureOverlap(x, y, width, height, structures);
}

function validateBounds(
  x: number,
  y: number,
  width: number,
  height: number,
  mapWidth: number,
  mapHeight: number
) {
  if (x < 0 || x + width > mapWidth || y < 0 || y + height > mapHeight) {
    throw new Error("Out of bounds");
  }
}

function validateEnergyField(
  x: number,
  y: number,
  width: number,
  height: number,
  myBuildings: Building[]
) {
  // If player has no buildings, any placement is valid (e.g. first building)
  if (myBuildings.length === 0) {
    return;
  }

  const newCX = x + width / 2;
  const newCY = y + height / 2;
  const newRadius = Math.max(width, height) / 2;

  for (const b of myBuildings) {
    const bCX = b.x + b.width / 2;
    const bCY = b.y + b.height / 2;
    const bRadius = Math.max(b.width, b.height) / 2;

    const dist = Math.sqrt((newCX - bCX) ** 2 + (newCY - bCY) ** 2);
    const maxDist = 4 + bRadius + newRadius;

    if (dist <= maxDist) {
      return; // Found a valid connection
    }
  }

  throw new Error(
    "Must place within 4-tile energy field of existing buildings"
  );
}

function validateBuildingOverlap(
  x: number,
  y: number,
  width: number,
  height: number,
  buildings: Building[]
) {
  for (const b of buildings) {
    const noOverlap =
      x >= b.x + b.width + 1 ||
      x + width + 1 <= b.x ||
      y >= b.y + b.height + 1 ||
      y + height + 1 <= b.y;

    if (!noOverlap) {
      throw new Error(
        "Cannot place here: overlapping or too close to another building"
      );
    }
  }
}

function validateStructureOverlap(
  x: number,
  y: number,
  width: number,
  height: number,
  structures: Structure[] | undefined
) {
  if (!structures) {
    return;
  }

  for (const s of structures) {
    const noOverlap =
      x >= s.x + s.width ||
      x + width <= s.x ||
      y >= s.y + s.height ||
      y + height <= s.y;

    if (!noOverlap) {
      throw new Error("Cannot place here: blocked by structure");
    }
  }
}
