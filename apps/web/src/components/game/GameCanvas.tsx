"use client";

import { api } from "@packages/backend/convex/_generated/api";
import { Canvas } from "@react-three/fiber";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BuildingsRenderer } from "./BuildingsRenderer";
import { CameraManager } from "./CameraManager";
import { DiplomacyModal } from "./DiplomacyModal";
import { EnergyRenderer, IncomeIndicator } from "./EffectsRenderer";
import { getEnergyTiles } from "./GameHooks";
import { InteractionPlane } from "./InteractionPlane";
import { MapRenderer, StructuresRenderer } from "./MapRenderer";
import { LasersRenderer, UnitsRenderer } from "./UnitsRenderer";

// --- Types ---

interface Entity {
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
  // Combat
  lastAttackTime?: number;
  health?: number;
  attackTargetId?: string;
  attackEndTime?: number;
}

interface Building {
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

interface Player {
  _id: string;
  credits: number;
  userId?: string;
  name?: string;
}

interface GameMap {
  _id: string;
  width: number;
  height: number;
  planetType: string;
  tiles?: number[]; // Legacy
  chunks?: any[];
  structures: any[];
}

interface GameCanvasProps {
  game: any;
  staticMap: GameMap | null;
  buildings: Building[];
  players: Player[];
  entities?: Entity[];
}

interface ExtendedGameCanvasProps extends GameCanvasProps {
  isBuildMode?: boolean;
  selectedBuilding?: string | null;
  onPlaceBuilding?: (type: string, x: number, y: number) => void;

  // Troop Selection
  selectedTroopId?: string | null;
  onSelectTroop?: (troopId: string | null) => void;
  onMoveTroop?: (x: number, y: number) => void;
  myPlayerId?: string;

  // Spawn timer data
  families?: Array<{ _id: string; homeId: string; lastSpawnTime?: number }>;
  troops?: Array<{ _id: string; barracksId: string; lastSpawnTime?: number }>;
}

export function GameCanvas({
  game,
  staticMap,
  buildings,
  players,
  entities,
  isBuildMode,
  selectedBuilding,
  onPlaceBuilding,
  selectedTroopId,
  onSelectTroop,
  onMoveTroop,
  families,
  troops,
  myPlayerId,
}: ExtendedGameCanvasProps) {
  const placeBase = useMutation(api.game.placeBase);
  const isDraggingRef = useRef(false);
  const [flyTo, setFlyTo] = useState<{
    x: number;
    y: number;
    zoom?: number;
  } | null>(null);
  const lastZoomedPhaseRef = useRef<string | null>(null);
  const [diplomacyTargetId, setDiplomacyTargetId] = useState<string | null>(
    null
  );

  // Handle Zoom Trigger
  useEffect(() => {
    if (
      game.phase === "simulation" &&
      lastZoomedPhaseRef.current !== "simulation" &&
      myPlayerId
    ) {
      const myBase = buildings.find(
        (b) => b.ownerId === myPlayerId && b.type === "base_central"
      );
      if (myBase) {
        const cx = myBase.x + myBase.width / 2;
        const cy = myBase.y + myBase.height / 2;
        setFlyTo({ x: cx, y: cy, zoom: 40 });
        lastZoomedPhaseRef.current = "simulation";
      }
    } else if (
      game.phase !== "simulation" &&
      lastZoomedPhaseRef.current === "simulation"
    ) {
      lastZoomedPhaseRef.current = null;
    }
  }, [game.phase, buildings, myPlayerId]);

  const handlePlace = async (x: number, y: number) => {
    if (game.phase === "placement") {
      try {
        await placeBase({
          gameId: game._id,
          x,
          y,
        });
      } catch (e) {
        console.error("Failed to place base:", e);
      }
    } else if (isBuildMode && selectedBuilding && onPlaceBuilding) {
      onPlaceBuilding(selectedBuilding, x, y);
    } else if (
      game.phase === "simulation" &&
      !isBuildMode &&
      !selectedTroopId
    ) {
      // Check for click on Enemy Central Base
      const clickedBuilding = buildings.find(
        (b) => x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height
      );

      if (
        clickedBuilding &&
        clickedBuilding.type === "base_central" &&
        clickedBuilding.ownerId !== myPlayerId
      ) {
        setDiplomacyTargetId(clickedBuilding.ownerId);
      }
    }
  };

  const myPlayer = players.find((p) => p._id === myPlayerId);
  const isConfused =
    myPlayer?.lastBetrayalTime &&
    Date.now() < myPlayer.lastBetrayalTime + 60_000;

  if (!staticMap) return null;

  const energyTiles = useMemo(() => {
    if (!(isBuildMode && myPlayerId)) return new Set<string>();
    return getEnergyTiles(
      buildings,
      myPlayerId,
      staticMap.width,
      staticMap.height
    );
  }, [buildings, isBuildMode, myPlayerId, staticMap]);

  // ⚡ Bolt Optimization: Consolidate entity processing into one pass (O(N))
  const alliances = useQuery(api.diplomacy.getAlliances, { gameId: game._id });

  // Calculate Visibility & Filter Entities
  const {
    visibleEntities,
    visibleBuildings,
    buildingStats,
    entityMap,
    attackingUnits,
    memberEntities,
    commanderEntities,
    soldierEntities,
    turretGunEntities,
    workingEntityPositions,
  } = useMemo(() => {
    // 1. Identify Allies
    const alliedPlayerIds = new Set<string>();
    if (myPlayerId && alliances) {
      alliedPlayerIds.add(myPlayerId);
      for (const a of alliances) {
        if (a.status === "allied") {
          if (a.player1Id === myPlayerId) alliedPlayerIds.add(a.player2Id);
          if (a.player2Id === myPlayerId) alliedPlayerIds.add(a.player1Id);
        }
      }
    } else if (myPlayerId) {
      alliedPlayerIds.add(myPlayerId);
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

    const stats: Record<string, any> = {};
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

      // Stats Logic (Still use ALL entities for stats if we want accurate counts, OR filter?
      // Typically stats like "4/4 members" should reflect reality, not visibility?
      // But the prompt says "The Fog hides enemy buildings".
      // The stats are used for "BuildingsRenderer" overlay (e.g. 2/4 workers).
      // If I filter buildings, I don't see the overlay anyway.
      // So this logic only runs for visible buildings.
      // Wait, I should probably count stats from ALL entities, but only display for filtered buildings.
      // But `stats` is used by `BuildingsRenderer`.
      // Let's compute stats for ALL entities to be safe, but only render filtered buildings.
      // Actually, if I can't see the unit, do I know it's working in the enemy factory?
      // Fog of War usually hides that info.
      // So computing stats only from visible entities is correct for enemy buildings.
      // For my buildings, I see everything.
      // So yes, using `filteredEntities` is correct.
    }

    // Re-loop all entities for stats on MY buildings if some of my units are invisible?
    // My units are always visible. So filteredEntities includes all mine.
    // So this is fine.

    // Calculate stats for buildings (Active/Working counts)
    for (const entity of filteredEntities) {
      if (entity.homeId && !entity.isInside) {
        if (!stats[entity.homeId])
          stats[entity.homeId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
          };
        stats[entity.homeId].active++;
        stats[entity.homeId].total++;
      }
      if (entity.troopId && !entity.isInside) {
        const troop = troops?.find((t) => t._id === entity.troopId);
        if (troop) {
          if (!stats[troop.barracksId])
            stats[troop.barracksId] = {
              active: 0,
              working: 0,
              sleeping: 0,
              total: 0,
            };
          stats[troop.barracksId].active++;
          stats[troop.barracksId].total++;
        }
      }
      if (entity.workplaceId) {
        if (!stats[entity.workplaceId])
          stats[entity.workplaceId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
          };
        if (entity.state === "working") stats[entity.workplaceId].working++;
      }
      if (entity.homeId && entity.state === "sleeping") {
        if (!stats[entity.homeId])
          stats[entity.homeId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
          };
        stats[entity.homeId].sleeping++;
      }
    }

    // Restore Logic: Populate lastSpawnTime from families and troops
    if (families) {
      for (const family of families) {
        if (!stats[family.homeId])
          stats[family.homeId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
          };
        stats[family.homeId].lastSpawnTime = family.lastSpawnTime;
      }
    }
    if (troops) {
      for (const troop of troops) {
        if (!stats[troop.barracksId])
          stats[troop.barracksId] = {
            active: 0,
            working: 0,
            sleeping: 0,
            total: 0,
          };
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
      turretGuns,
      workingEntityPositions: workers,
    };
  }, [entities, families, troops, buildings, alliances, myPlayerId]);

  return (
    <Canvas
      camera={{
        zoom: 20,
        position: [staticMap.width / 2, staticMap.height / 2, 100],
      }}
      className="cursor-crosshair"
      gl={{ antialias: false }}
      orthographic
    >
      <color args={["#000"]} attach="background" />
      <ambientLight intensity={0.5} />
      <directionalLight intensity={1} position={[10, 10, 10]} />

      <CameraManager
        flyTo={flyTo}
        isDraggingRef={isDraggingRef}
        mapHeight={staticMap.height}
        mapWidth={staticMap.width}
      />

      <MapRenderer map={staticMap} />
      <StructuresRenderer map={staticMap} />

      {isBuildMode && <EnergyRenderer validTiles={energyTiles} />}

      <BuildingsRenderer buildings={visibleBuildings} stats={buildingStats} />

      {entities && (
        <LasersRenderer attackingUnits={attackingUnits} entityMap={entityMap} />
      )}

      {entities && (
        <UnitsRenderer
          commanders={commanderEntities}
          entities={visibleEntities}
          families={memberEntities}
          isDraggingRef={isDraggingRef}
          onSelectTroop={onSelectTroop}
          selectedTroopId={selectedTroopId}
          soldiers={soldierEntities}
          turretGuns={turretGunEntities}
        />
      )}

      {entities && <IncomeIndicator workingEntities={workingEntityPositions} />}

      <InteractionPlane
        buildings={visibleBuildings}
        energyTiles={energyTiles}
        game={game}
        height={staticMap.height}
        isBuildMode={isBuildMode}
        isDraggingRef={isDraggingRef}
        onClick={handlePlace}
        onMoveTroop={onMoveTroop}
        selectedBuilding={selectedBuilding}
        selectedTroopId={selectedTroopId}
        staticMap={staticMap}
        width={staticMap.width}
      />
    </Canvas>
  diplomacyTargetId && myPlayerId && (
    <DiplomacyModal
      gameId={game._id}
      isOpen={!!diplomacyTargetId}
      myPlayerId={myPlayerId}
      onClose={() => setDiplomacyTargetId(null)}
      targetPlayerId={diplomacyTargetId}
    />
  );
  isConfused && (
    <div className="pointer-events-none fixed inset-0 z-50 animate-pulse bg-red-500/10 mix-blend-multiply" />
  );
  </React.Fragment>
  )
}
