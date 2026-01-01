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
  const best = candidates[0];
  if (best) {
    return { x: best.x, y: best.y };
  }
  return { x: 10, y: 10 };
}
