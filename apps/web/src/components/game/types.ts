import type { Doc } from "@packages/backend/convex/_generated/dataModel";

export interface Entity {
  _id: string;
  _creationTime: number;
  gameId: string;
  ownerId: string;
  type: string;
  state: string;
  x: number;
  y: number;
  isInside: boolean;
  familyId?: string;
  troopId?: string;
  homeId?: string;
  stateEnd?: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  targetWorkshopId?: string;
  targetHomeId?: string;
  workplaceId?: string;
  reservedFactoryId?: string;
  // Combat
  lastAttackTime?: number;
  health?: number;
  attackTargetId?: string;
  attackEndTime?: number;
}

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

export interface Player {
  _id: string;
  credits?: number;
  userId?: string;
  name?: string;
  teamId?: string;
  lastBetrayalTime?: number;
}

export interface Structure {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GameMap {
  _id: string;
  width: number;
  height: number;
  planetType: string;
  tiles?: number[]; // Legacy
  chunks?: Doc<"chunks">[];
  structures: Structure[];
}

// Stats interface used in visibility calculations
export interface BuildingStats {
  active: number;
  working: number;
  sleeping: number;
  total: number;
  assigned: number;
  lastSpawnTime?: number;
}
