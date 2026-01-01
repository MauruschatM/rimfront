"use client";

import { api } from "@packages/backend/convex/_generated/api";
import { Canvas } from "@react-three/fiber";
import { useMutation } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BuildingsRenderer } from "./BuildingsRenderer";
import { CameraManager } from "./CameraManager";
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
    }
  };

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
  const {
    buildingStats,
    entityMap,
    attackingUnits,
    memberEntities,
    commanderEntities,
    soldierEntities,
    turretGunEntities,
    workingEntityPositions,
  } = useMemo(() => {
    const stats: Record<
      string,
      {
        active: number;
        working: number;
        sleeping: number;
        total: number;
        lastSpawnTime?: number;
      }
    > = {};
    const map = new Map<string, Entity>();
    const attacking: Entity[] = [];
    const members: Entity[] = [];
    const commanders: Entity[] = [];
    const soldiers: Entity[] = [];
    const turretGuns: Entity[] = [];
    const workers: Array<{ id: string; x: number; y: number }> = [];

    const now = Date.now();

    if (entities) {
      for (const entity of entities) {
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

        // Stats Logic
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
          if (entity.state === "working") {
            stats[entity.workplaceId].working++;
          }
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
    }

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
      buildingStats: stats,
      entityMap: map,
      attackingUnits: attacking,
      memberEntities: members,
      commanderEntities: commanders,
      soldierEntities: soldiers,
      turretGunEntities: turretGuns,
      workingEntityPositions: workers,
    };
  }, [entities, families, troops]);

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

      <BuildingsRenderer buildings={buildings} stats={buildingStats} />

      {entities && (
        <LasersRenderer attackingUnits={attackingUnits} entityMap={entityMap} />
      )}

      {entities && (
        <UnitsRenderer
          commanders={commanderEntities}
          entities={entities}
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
        buildings={buildings}
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
  );
}
