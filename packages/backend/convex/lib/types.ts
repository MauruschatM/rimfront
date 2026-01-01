import type { Id } from "../_generated/dataModel";

// Interface for buildings stored in map
export interface Building {
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

// Interface for structures (rocks, trees, etc.)
export interface Structure {
  x: number;
  y: number;
  type: string;
  width: number;
  height: number;
}

export interface Entity {
  _id: Id<"entities">;
  gameId: Id<"games">;
  ownerId: Id<"players">;
  familyId?: Id<"families">;
  troopId?: Id<"troops">;
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
  buildingId?: string;
}

export interface Troop {
  _id: Id<"troops">;
  gameId: Id<"games">;
  ownerId: Id<"players">;
  barracksId: string;
  targetPos?: { x: number; y: number };
  targetBuildingId?: string; // Enemy building to attack
  lastSpawnTime?: number;
  state: string;
}

export interface Family {
  _id: Id<"families">;
  gameId: Id<"games">;
  homeId: string;
  ownerId: Id<"players">;
  lastSpawnTime?: number;
}

export interface Player {
  _id: Id<"players">;
  gameId: Id<"games">;
  userId?: string;
  credits: number;
  isBot?: boolean;
  status?: string;
  lastBetrayalTime?: number;
  teamId?: string;
  hasPlacedBase?: boolean;
  inflation?: number;
}
