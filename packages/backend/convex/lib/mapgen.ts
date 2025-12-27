import { createNoise2D } from "simplex-noise";

// Tile IDs
export const TILES = {
  EMPTY: 0,
  DIRT: 1,
  SAND: 2,
  GRASS: 3,
  SNOW: 4,
  ICE: 5,
  ROCK: 6,
  LAVA: 7,
  WATER: 8,
};

export const PLANETS = {
  TATOOINE: "tatooine",
  HOTH: "hoth",
  ENDOR: "endor",
  MUSTAFAR: "mustafar",
};

interface Structure {
  x: number;
  y: number;
  type: string;
  width: number;
  height: number;
}

export function generateMap(planetType: string, width: number, height: number) {
  const noise2D = createNoise2D();
  const tiles: number[] = new Array(width * height).fill(TILES.EMPTY);
  const structures: Structure[] = [];

  // Helper to get array index
  const idx = (x: number, y: number) => y * width + x;

  // Helper to check distance from center for circular map
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) / 2 - 2; // -2 for margin

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // Circle Mask
      const dist = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      if (dist > radius) {
        tiles[idx(x, y)] = TILES.EMPTY;
        continue;
      }

      const nx = x / 50; // Noise scale
      const ny = y / 50;
      const val = noise2D(nx, ny); // -1 to 1

      // Planet Generation Logic
      let tileId = TILES.DIRT;

      switch (planetType) {
        case PLANETS.TATOOINE: // Desert
          if (val > 0.3) tileId = TILES.ROCK;
          else if (val > -0.2) tileId = TILES.SAND;
          else tileId = TILES.DIRT;

          // Chance for Structures (Rocks)
          if (Math.random() < 0.005 && tileId !== TILES.EMPTY) {
             structures.push({ x, y, type: "rock_large", width: 2, height: 2 });
          }
          break;

        case PLANETS.HOTH: // Snow/Ice
          if (val > 0.4) tileId = TILES.ICE;
          else tileId = TILES.SNOW;

          if (Math.random() < 0.002 && tileId !== TILES.EMPTY) {
             structures.push({ x, y, type: "ice_spike", width: 1, height: 2 });
          }
          break;

        case PLANETS.ENDOR: // Forest
          if (val > 0.2) tileId = TILES.GRASS;
          else tileId = TILES.DIRT;

          if (Math.random() < 0.02 && tileId !== TILES.EMPTY) { // High density trees
             structures.push({ x, y, type: "tree_huge", width: 2, height: 3 });
          }
          break;

        case PLANETS.MUSTAFAR: // Lava
          if (val > 0.5) tileId = TILES.ROCK;
          else if (val < -0.3) tileId = TILES.LAVA;
          else tileId = TILES.DIRT; // Ashy dirt

          if (Math.random() < 0.005 && tileId !== TILES.LAVA && tileId !== TILES.EMPTY) {
             structures.push({ x, y, type: "obsidian_rock", width: 2, height: 2 });
          }
          break;

        default:
          tileId = TILES.DIRT;
      }

      tiles[idx(x, y)] = tileId;
    }
  }

  return { tiles, structures };
}
