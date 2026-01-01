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

export function calculateBuildingCost(
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
