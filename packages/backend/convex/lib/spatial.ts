// Spatial Hashing and Helpers

interface Unit {
  id: string;
  x: number;
  y: number;
  ownerId: string;
  type: "commander" | "soldier" | "resident";
  hp?: number; // Optional if not tracked yet
}

interface Building {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  ownerId: string;
  type: string;
  health?: number;
}

// Spatial Grid - A simple 2D array of lists
// Given map size is 256x256, we can use a bucket size of 16x16 (16 chunks per row/col)
// Or just a Map<string, Unit[]> where key is "chunkX,chunkY"
const CHUNK_SIZE = 16;

export class SpatialMap {
  private units = new Map<string, Unit[]>();
  private buildings = new Map<string, Building[]>();
  width: number;
  height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  private getKey(x: number, y: number): string {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cy = Math.floor(y / CHUNK_SIZE);
    return `${cx},${cy}`;
  }

  addUnit(unit: Unit) {
    const key = this.getKey(unit.x, unit.y);
    if (!this.units.has(key)) this.units.set(key, []);
    this.units.get(key)!.push(unit);
  }

  addBuilding(building: Building) {
    // Buildings can span multiple chunks
    const startX = Math.floor(building.x / CHUNK_SIZE);
    const endX = Math.floor((building.x + building.width - 1) / CHUNK_SIZE);
    const startY = Math.floor(building.y / CHUNK_SIZE);
    const endY = Math.floor((building.y + building.height - 1) / CHUNK_SIZE);

    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        const key = `${cx},${cy}`;
        if (!this.buildings.has(key)) this.buildings.set(key, []);
        // Avoid duplicates in the bucket? Usually okay if we filter later, or use Set
        this.buildings.get(key)!.push(building);
      }
    }
  }

  /**
   * Finds nearby enemies (Units and Buildings) within a radius.
   * Naive implementation: Check 9 neighboring chunks (or more depending on radius)
   */
  findNearbyEnemies(
    x: number,
    y: number,
    radius: number,
    myOwnerId: string
  ): { units: Unit[]; buildings: Building[] } {
    const enemies: Unit[] = [];
    const enemyBuildings: Building[] = [];

    const centerCx = Math.floor(x / CHUNK_SIZE);
    const centerCy = Math.floor(y / CHUNK_SIZE);
    const radiusChunks = Math.ceil(radius / CHUNK_SIZE);

    for (
      let cx = centerCx - radiusChunks;
      cx <= centerCx + radiusChunks;
      cx++
    ) {
      for (
        let cy = centerCy - radiusChunks;
        cy <= centerCy + radiusChunks;
        cy++
      ) {
        const key = `${cx},${cy}`;

        // Units
        const chunkUnits = this.units.get(key);
        if (chunkUnits) {
          for (const u of chunkUnits) {
            if (u.ownerId !== myOwnerId) {
              // Precise Distance Check
              const dist = Math.sqrt((u.x - x) ** 2 + (u.y - y) ** 2);
              if (dist <= radius) {
                enemies.push(u);
              }
            }
          }
        }

        // Buildings
        const chunkBuildings = this.buildings.get(key);
        if (chunkBuildings) {
          for (const b of chunkBuildings) {
            if (b.ownerId !== myOwnerId) {
              // Simple distance to center or corners
              // For now, center of building
              const bx = b.x + b.width / 2;
              const by = b.y + b.height / 2;
              const dist = Math.sqrt((bx - x) ** 2 + (by - y) ** 2);
              // Adjust for building size? "Radius" usually means range to edge.
              // Let's stick to center distance for simplicity or refine.
              if (dist <= radius + Math.max(b.width, b.height) / 2) {
                enemyBuildings.push(b);
              }
            }
          }
        }
      }
    }

    // De-duplicate buildings since they span chunks
    const uniqueBuildings = Array.from(new Set(enemyBuildings));

    return { units: enemies, buildings: uniqueBuildings };
  }

  findClosestTarget(
    x: number,
    y: number,
    radius: number,
    myOwnerId: string
  ): {
    type: "unit" | "building";
    target: Unit | Building;
    dist: number;
  } | null {
    const { units, buildings } = this.findNearbyEnemies(
      x,
      y,
      radius,
      myOwnerId
    );

    let bestTarget: {
      type: "unit" | "building";
      target: Unit | Building;
      dist: number;
    } | null = null;
    let bestPriority = Number.POSITIVE_INFINITY;
    let bestDist = Number.POSITIVE_INFINITY;

    // Priority: Troops (1) -> Residents (2) -> Buildings (3)
    // Optimization: Single pass, no sorting

    for (const u of units) {
      const dist = Math.sqrt((u.x - x) ** 2 + (u.y - y) ** 2);
      if (dist > radius) continue;

      const priority = u.type === "soldier" || u.type === "commander" ? 1 : 2;

      if (
        priority < bestPriority ||
        (priority === bestPriority && dist < bestDist)
      ) {
        bestPriority = priority;
        bestDist = dist;
        bestTarget = { type: "unit", target: u, dist };
      }
    }

    for (const b of buildings) {
      const bx = b.x + b.width / 2;
      const by = b.y + b.height / 2;
      const dist = Math.sqrt((bx - x) ** 2 + (by - y) ** 2);
      // Relaxed radius check for buildings since they are large?
      // Or strict center distance? Using same radius for now.
      if (dist > radius + Math.max(b.width, b.height) / 2) continue;

      const priority = 3;

      if (
        priority < bestPriority ||
        (priority === bestPriority && dist < bestDist)
      ) {
        bestPriority = priority;
        bestDist = dist;
        bestTarget = { type: "building", target: b, dist };
      }
    }

    return bestTarget;
  }
}
