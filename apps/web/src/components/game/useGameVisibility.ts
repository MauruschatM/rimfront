import { api } from "@packages/backend/convex/_generated/api";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import type { Building, BuildingStats, Entity, Player } from "./types";

interface UseGameVisibilityProps {
  gameId: string; // ID<"games"> but handled as string in frontend often
  myPlayerId?: string;
  players: Player[];
  buildings: Building[];
  entities?: Entity[];
  families?: Array<{ _id: string; homeId: string; lastSpawnTime?: number }>;
  troops?: Array<{ _id: string; barracksId: string; lastSpawnTime?: number }>;
}

export function useGameVisibility({
  gameId,
  myPlayerId,
  players,
  buildings,
  entities,
  families,
  troops,
}: UseGameVisibilityProps) {
  // ⚡ Bolt Optimization: Consolidate entity processing into one pass (O(N))
  // We explicitly cast gameId to any because api.diplomacy.getAlliances expects Id<"games">
  // but we are passing a string (which is usually compatible at runtime but TS might complain)
  // However, in GameCanvas it was passed directly.
  const alliances = useQuery(api.diplomacy.getAlliances, {
    gameId: gameId as any,
  });

  return useMemo(() => {
    // 1. Identify Allies
    const alliedPlayerIds = new Set<string>();
    const myPlayer = players.find((p) => p._id === myPlayerId);

    if (myPlayerId) {
      alliedPlayerIds.add(myPlayerId);

      // Check for Teammates (Fixed Alliance)
      if (myPlayer?.teamId) {
        for (const p of players) {
          if (p.teamId === myPlayer.teamId) {
            alliedPlayerIds.add(p._id);
          }
        }
      }

      // Check for Dynamic Alliances (Diplomacy)
      if (alliances) {
        for (const a of alliances) {
          if (a.status === "allied") {
            if (a.player1Id === myPlayerId) alliedPlayerIds.add(a.player2Id);
            if (a.player2Id === myPlayerId) alliedPlayerIds.add(a.player1Id);
          }
        }
      }
    }

    // 2. Identify Visible Chunks (Simple Grid 16x16)
    const visibleChunks = new Set<string>();
    const CHUNK_SIZE = 16;

    const markVisible = (x: number, y: number, radius: number) => {
      const minCX = Math.floor((x - radius) / CHUNK_SIZE);
      const maxCX = Math.floor((x + radius) / CHUNK_SIZE);
      const minCY = Math.floor((y - radius) / CHUNK_SIZE);
      const maxCY = Math.floor((y + radius) / CHUNK_SIZE);

      for (let cx = minCX; cx <= maxCX; cx++) {
        for (let cy = minCY; cy <= maxCY; cy++) {
          visibleChunks.add(`${cx},${cy}`);
        }
      }
    };

    // Add Buildings Vision
    for (const b of buildings) {
      if (alliedPlayerIds.has(b.ownerId)) {
        markVisible(b.x + b.width / 2, b.y + b.height / 2, 20); // 20 tile radius vision
      }
    }

    // Add Entities Vision
    if (entities) {
      for (const e of entities) {
        if (alliedPlayerIds.has(e.ownerId) && !e.isInside) {
          markVisible(e.x, e.y, 15);
        }
      }
    }

    // 3. Filter Entities & Buildings
    const isVisible = (x: number, y: number, ownerId: string, type: string) => {
      if (alliedPlayerIds.has(ownerId)) return true;
      if (type === "base_central") return true; // Always see Enemy Central Base

      const cx = Math.floor(x / CHUNK_SIZE);
      const cy = Math.floor(y / CHUNK_SIZE);
      return visibleChunks.has(`${cx},${cy}`);
    };

    const filteredBuildings = buildings.filter((b) =>
      isVisible(b.x + b.width / 2, b.y + b.height / 2, b.ownerId, b.type)
    );
    const filteredEntities = entities
      ? entities.filter((e) => isVisible(e.x, e.y, e.ownerId, e.type))
      : [];

    // --- Original Logic adapted to filtered lists ---

    const stats: Record<string, BuildingStats> = {};
    const map = new Map<string, Entity>();
    const attacking: Entity[] = [];
    const members: Entity[] = [];
    const commanders: Entity[] = [];
    const soldiers: Entity[] = [];
    const turretGuns: Entity[] = [];
    const workers: Array<{ id: string; x: number; y: number }> = [];
    const now = Date.now();

    for (const entity of filteredEntities) {
      map.set(entity._id, entity);

      if (
        entity.attackTargetId &&
        entity.attackEndTime &&
        entity.attackEndTime > now
      ) {
        attacking.push(entity);
      }

      if (!entity.isInside) {
        if (entity.type === "member") members.push(entity);
        else if (entity.type === "commander") commanders.push(entity);
        else if (entity.type === "soldier") soldiers.push(entity);
        else if (entity.type === "turret_gun") turretGuns.push(entity);
      }

      if (entity.state === "working" && entity.workplaceId) {
        workers.push({ id: entity._id, x: entity.x, y: entity.y });
      }
    }

    // Calculate stats for buildings
    for (const entity of filteredEntities) {
      // Helper to init stats
      const initStats = (id: string) => {
        if (!stats[id])
          stats[id] = {
            active: 0, // Total visible/associated
            working: 0, // Inside Workshop
            sleeping: 0, // Inside House
            total: 0, // Total associated (Alive)
            assigned: 0, // Reserved Workshop
          };
      };

      // House Stats
      if (entity.homeId) {
        initStats(entity.homeId);
        stats[entity.homeId].total++;
        if (!entity.isInside) stats[entity.homeId].active++;
        if (entity.isInside && entity.state === "sleeping") {
          stats[entity.homeId].sleeping++;
        }
      }

      // Barracks Stats
      if (entity.troopId) {
        const troop = troops?.find((t) => t._id === entity.troopId);
        if (troop) {
          initStats(troop.barracksId);
          stats[troop.barracksId].total++;
          if (!entity.isInside) stats[troop.barracksId].active++;
        }
      }

      // Workshop Stats
      const workshopId = entity.reservedFactoryId || entity.workplaceId;
      if (workshopId) {
        initStats(workshopId);
        stats[workshopId].assigned++;
      }

      if (entity.workplaceId && entity.isInside) {
        initStats(entity.workplaceId);
        stats[entity.workplaceId].working++;
      }
    }

    // Restore Logic: Populate lastSpawnTime from families and troops
    if (families) {
      for (const family of families) {
        if (!stats[family.homeId]) {
          stats[family.homeId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
            assigned: 0,
          };
        }
        stats[family.homeId].lastSpawnTime = family.lastSpawnTime;
      }
    }
    if (troops) {
      for (const troop of troops) {
        if (!stats[troop.barracksId]) {
          stats[troop.barracksId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
            assigned: 0,
          };
        }
        stats[troop.barracksId].lastSpawnTime = troop.lastSpawnTime;
      }
    }

    return {
      visibleEntities: filteredEntities,
      visibleBuildings: filteredBuildings,
      buildingStats: stats,
      entityMap: map,
      attackingUnits: attacking,
      memberEntities: members,
      commanderEntities: commanders,
      soldierEntities: soldiers,
      turretGunEntities: turretGuns,
      workingEntityPositions: workers,
    };
  }, [entities, families, troops, buildings, alliances, myPlayerId, players]);
}
