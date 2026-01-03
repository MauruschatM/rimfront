"use client";

import { api } from "@packages/backend/convex/_generated/api";
import type { Doc } from "@packages/backend/convex/_generated/dataModel";
import { Canvas } from "@react-three/fiber";
import { useMutation } from "convex/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { BuildingsRenderer } from "./BuildingsRenderer";
import { CameraManager } from "./CameraManager";
import { DiplomacyModal } from "./DiplomacyModal";
import { EnergyRenderer, IncomeIndicator } from "./EffectsRenderer";
import { getEnergyTiles } from "./GameHooks";
import { InteractionPlane } from "./InteractionPlane";
import { MapRenderer, StructuresRenderer } from "./MapRenderer";
import type { Building, Entity, GameMap, Player } from "./types";
import { LasersRenderer, UnitsRenderer } from "./UnitsRenderer";
import { useGameVisibility } from "./useGameVisibility";

interface GameCanvasProps {
  game: Doc<"games">;
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
          gameId: game._id as any,
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
    !!myPlayer?.lastBetrayalTime &&
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

  // Use the extracted hook for visibility and stats
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
  } = useGameVisibility({
    gameId: game._id,
    myPlayerId,
    players,
    buildings,
    entities,
    families,
    troops,
  });

  return (
    <Fragment>
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
          <LasersRenderer
            attackingUnits={attackingUnits}
            entityMap={entityMap}
          />
        )}

        {entities && (
          <UnitsRenderer
            commanders={commanderEntities}
            entities={visibleEntities}
            entityMap={entityMap}
            families={memberEntities}
            isDraggingRef={isDraggingRef}
            onSelectTroop={onSelectTroop}
            selectedTroopId={selectedTroopId}
            soldiers={soldierEntities}
            turretGuns={turretGunEntities}
          />
        )}

        {entities && (
          <IncomeIndicator workingEntities={workingEntityPositions} />
        )}

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
      {diplomacyTargetId && myPlayerId && (
        <DiplomacyModal
          gameId={game._id}
          isOpen={!!diplomacyTargetId}
          myPlayerId={myPlayerId}
          onClose={() => setDiplomacyTargetId(null)}
          targetPlayerId={diplomacyTargetId}
        />
      )}
      {isConfused && (
        <div className="pointer-events-none fixed inset-0 z-50 animate-pulse bg-red-500/10 mix-blend-multiply" />
      )}
    </Fragment>
  );
}
