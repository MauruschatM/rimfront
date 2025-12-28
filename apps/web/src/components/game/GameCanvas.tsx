"use client";

import { api } from "@packages/backend/convex/_generated/api";
import { MapControls, Text } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMutation } from "convex/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three"; // Keeping THREE namespace as it's cleaner for many types
import { createPlanetPalette } from "@/lib/assets";

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
  troupeId?: string;
  homeId?: string;
  stateEnd?: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  targetWorkshopId?: string;
  targetHomeId?: string;
  workplaceId?: string;
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
}

const TILE_SIZE = 1;

// --- Helpers ---

// Reassemble chunks into tiles array
function reassembleTiles(
  chunks: any[],
  width: number,
  height: number
): number[] {
  const tiles = new Array(width * height);
  const CHUNK_SIZE = 64;

  for (const chunk of chunks) {
    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const globalX = chunk.chunkX * CHUNK_SIZE + x;
        const globalY = chunk.chunkY * CHUNK_SIZE + y;
        const globalIndex = globalY * width + globalX;
        const chunkIndex = y * CHUNK_SIZE + x;
        tiles[globalIndex] = chunk.tiles[chunkIndex];
      }
    }
  }

  return tiles;
}

// --- Components ---

// Memoized Map Renderer
const MapRenderer = memo(function MapRenderer({ map }: { map: GameMap }) {
  const { width, height, planetType } = map;

  const tiles = useMemo(() => {
    if (map.tiles) {
      return map.tiles;
    }
    if (map.chunks) {
      return reassembleTiles(map.chunks, width, height);
    }
    return [];
  }, [map.tiles, map.chunks, width, height]);

  const palette = useMemo(() => createPlanetPalette(planetType), [planetType]);

  const noiseTexture = useMemo(() => {
    if (typeof document === "undefined") {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return null;
    }
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 64; i++) {
      const x = Math.floor(Math.random() * 16);
      const y = Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
      ctx.fillRect(x, y, 1, 1);
    }
    return new THREE.CanvasTexture(canvas);
  }, []);

  const meshRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) {
      return;
    }

    const tempObj = new THREE.Object3D();
    const color = new THREE.Color();

    let i = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = tiles[i];
        if (tileId !== 0) {
          tempObj.position.set(x * TILE_SIZE, y * TILE_SIZE, 0);
          tempObj.updateMatrix();
          mesh.setMatrixAt(i, tempObj.matrix);

          const tileColor = getTileColor(tileId, palette);
          color.set(tileColor);
          mesh.setColorAt(i, color);
        } else {
          tempObj.position.set(0, 0, -1000);
          tempObj.updateMatrix();
          mesh.setMatrixAt(i, tempObj.matrix);
        }
        i++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [width, height, tiles, palette]);

  return (
    <instancedMesh
      args={[undefined as any, undefined as any, width * height]}
      ref={meshRef}
    >
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial
        color="white"
        map={noiseTexture || undefined}
        opacity={0.8}
        transparent
      />
    </instancedMesh>
  );
});

function getTileColor(tileId: number, palette: any): string {
  switch (tileId) {
    case 1:
      return palette.dirt;
    case 2:
      return palette.sand;
    case 3:
      return palette.sand; // Grass fallback
    case 6:
      return palette.rock;
    case 7:
      return "#ff3300"; // Lava
    case 4:
      return "#ffffff"; // Snow
    case 5:
      return "#aaffff"; // Ice
    default:
      return palette.dirt;
  }
}

function StructuresRenderer({ map }: { map: GameMap }) {
  const palette = useMemo(
    () => createPlanetPalette(map.planetType),
    [map.planetType]
  );

  const structures = map.structures as Array<{
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }>;

  return (
    <group>
      {structures.map((s, i) => (
        <mesh
          key={`${s.type}-${s.x}-${s.y}-${i}`}
          position={[s.x + s.width / 2 - 0.5, s.y + s.height / 2 - 0.5, 0.1]}
        >
          <boxGeometry args={[s.width, s.height, 1]} />
          <meshStandardMaterial color={palette.rock} />
        </mesh>
      ))}
    </group>
  );
}

function BuildingsRenderer({
  buildings,
  entities,
}: {
  buildings: Building[];
  entities?: Entity[];
}) {
  // Count workshop occupancy
  const workshopOccupancy = useMemo(() => {
    const counts: Record<string, number> = {};
    if (entities) {
      for (const entity of entities) {
        if (entity.state === "working" && entity.workplaceId) {
          counts[entity.workplaceId] = (counts[entity.workplaceId] || 0) + 1;
        }
      }
    }
    return counts;
  }, [entities]);

  return (
    <group>
      {buildings.map((b) => {
        const isUnderConstruction =
          b.constructionEnd && b.constructionEnd > Date.now();
        const occupancy = workshopOccupancy[b.id] || 0;
        const isWorkshop = b.type === "workshop";

        return (
          <group key={b.id}>
            <mesh
              position={[
                b.x + b.width / 2 - 0.5,
                b.y + b.height / 2 - 0.5,
                0.2,
              ]}
            >
              <boxGeometry args={[b.width, b.height, 2]} />
              <meshStandardMaterial
                color={isUnderConstruction ? "orange" : "blue"}
                wireframe={!!isUnderConstruction}
              />
            </mesh>
            {/* Status for Under Construction */}
            {isUnderConstruction && (
              <mesh
                position={[
                  b.x + b.width / 2 - 0.5,
                  b.y + b.height / 2 - 0.5,
                  1.5,
                ]}
              >
                <boxGeometry args={[b.width * 0.8, b.height * 0.8, 0.1]} />
                <meshBasicMaterial color="yellow" opacity={0.5} transparent />
              </mesh>
            )}
            {/* Workshop worker count display */}
            {isWorkshop && !isUnderConstruction && (
              <Text
                anchorX="center"
                anchorY="middle"
                color={occupancy > 0 ? "lime" : "red"}
                fontSize={1.5}
                position={[b.x + b.width / 2 - 0.5, b.y + b.height + 0.5, 2]}
              >
                {occupancy > 0 ? `👷${occupancy}` : "⚠️0"}
              </Text>
            )}
          </group>
        );
      })}
    </group>
  );
}

function UnitsRenderer({
  entities,
  selectedTroopId,
  onSelectTroop,
}: {
  entities: Entity[];
  selectedTroopId?: string | null;
  onSelectTroop?: (id: string | null) => void;
}) {
  const familiesRef = useRef<THREE.InstancedMesh>(null);
  const commandersRef = useRef<THREE.InstancedMesh>(null);
  const soldiersRef = useRef<THREE.InstancedMesh>(null);

  const { families, commanders, soldiers } = useMemo(() => {
    const families: Entity[] = [];
    const commanders: Entity[] = [];
    const soldiers: Entity[] = [];

    const activeEntities = (entities || []).filter((e) => !e.isInside);
    for (const entity of activeEntities) {
      if (entity.type === "member") {
        families.push(entity);
      } else if (entity.type === "commander") {
        commanders.push(entity);
      } else if (entity.type === "soldier") {
        soldiers.push(entity);
      }
    }
    return { families, commanders, soldiers };
  }, [entities]);

  const handleUnitClick = useCallback(
    (
      e: { stopPropagation: () => void; instanceId?: number },
      list: Entity[]
    ) => {
      if (!onSelectTroop) {
        return;
      }
      e.stopPropagation();
      const instanceId = e.instanceId;
      if (instanceId !== undefined && list[instanceId]) {
        const unit = list[instanceId];
        if (unit.troupeId) {
          onSelectTroop(unit.troupeId);
        }
      }
    },
    [onSelectTroop]
  );

  useEffect(() => {
    const mesh = familiesRef.current;
    if (!mesh) {
      return;
    }
    const tempObj = new THREE.Object3D();
    const color = new THREE.Color();
    families.forEach((r, i) => {
      tempObj.position.set(r.x, r.y, 0.5);
      tempObj.scale.set(0.5, 0.5, 0.5);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);
      if (r.state === "working") {
        color.set("lime");
      } else if (r.state === "sleeping") {
        color.set("blue");
      } else {
        color.set("white");
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [families]);

  useEffect(() => {
    const mesh = commandersRef.current;
    if (!mesh) {
      return;
    }
    const tempObj = new THREE.Object3D();
    const color = new THREE.Color();
    commanders.forEach((c, i) => {
      tempObj.position.set(c.x, c.y, 1);
      tempObj.scale.set(0.8, 0.8, 0.8);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);
      if (selectedTroopId && c.troupeId === selectedTroopId) {
        color.set("yellow");
      } else {
        color.set("red");
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [commanders, selectedTroopId]);

  useEffect(() => {
    const mesh = soldiersRef.current;
    if (!mesh) {
      return;
    }
    const tempObj = new THREE.Object3D();
    const color = new THREE.Color();
    soldiers.forEach((s, i) => {
      tempObj.position.set(s.x, s.y, 0.5);
      tempObj.scale.set(0.4, 0.4, 0.4);
      tempObj.updateMatrix();
      mesh.setMatrixAt(i, tempObj.matrix);
      if (selectedTroopId && s.troupeId === selectedTroopId) {
        color.set("orange");
      } else {
        color.set("maroon");
      }
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true;
    }
  }, [soldiers, selectedTroopId]);

  return (
    <group>
      {/* Families */}
      {families.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, families.length]}
          ref={familiesRef}
        >
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial />
        </instancedMesh>
      )}
      {/* Commanders */}
      {commanders.length > 0 && (
        <instancedMesh
          args={[undefined as any, undefined as any, commanders.length]}
          onClick={(e) => {
            handleUnitClick(e, commanders);
          }}
          onPointerOut={() => {
            document.body.style.cursor = "default";
          }}
          onPointerOver={() => {
            document.body.style.cursor = "pointer";
          }}
          ref={commandersRef}
        >
          <boxGeometry args={[1, 1, 2]} />
          <meshStandardMaterial />
        </instancedMesh>
      )}
      {/* Soldiers */}
      {soldiers.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, soldiers.length]}
          onClick={(e) => handleUnitClick(e, soldiers)}
          ref={soldiersRef}
        >
          <boxGeometry args={[0.8, 0.8, 1]} />
          <meshStandardMaterial />
        </instancedMesh>
      )}
    </group>
  );
}

// Floating income indicator for working residents
function IncomeIndicator({ entities }: { entities: Entity[] }) {
  const [indicators, setIndicators] = useState<
    Array<{ id: string; x: number; y: number; startTime: number }>
  >([]);

  useEffect(() => {
    const newIndicators = getNewIncomeIndicators(entities);
    if (newIndicators.length > 0) {
      setIndicators((prev) => [...prev.slice(-10), ...newIndicators]);
    }
  }, [entities]);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setIndicators((prev) => prev.filter((i) => now - i.startTime < 1500));
    }, 500);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <group>
      {indicators.map((ind) => (
        <FloatingText
          key={ind.id}
          startTime={ind.startTime}
          x={ind.x}
          y={ind.y}
        />
      ))}
    </group>
  );
}

function getNewIncomeIndicators(entities: Entity[]) {
  const currentWorkers = new Set<string>();
  const workerPositions: Record<string, { x: number; y: number }> = {};

  if (entities) {
    for (const entity of entities) {
      if (entity.state === "working" && entity.workplaceId) {
        currentWorkers.add(entity._id);
        workerPositions[entity._id] = { x: entity.x, y: entity.y };
      }
    }
  }

  const now = Date.now();
  const newIndicators: Array<{
    id: string;
    x: number;
    y: number;
    startTime: number;
  }> = [];

  for (const workerId of Array.from(currentWorkers)) {
    const pos = workerPositions[workerId];
    if (pos && Math.random() < 0.3) {
      newIndicators.push({
        id: `${workerId}-${now}`,
        x: pos.x,
        y: pos.y,
        startTime: now,
      });
    }
  }
  return newIndicators;
}

// Single floating +1k text
function FloatingText({
  x,
  y,
  startTime,
}: {
  x: number;
  y: number;
  startTime: number;
}) {
  const textRef = useRef<any>(null);

  useEffect(() => {
    const mesh = textRef.current;
    if (!mesh) {
      return;
    }
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / 1500, 1);
    const pos = mesh.position;
    if (pos) {
      pos.y = y + 1 + progress * 2;
      pos.z = 3;
    }
    const material = mesh.material as THREE.MeshBasicMaterial;
    if (material) {
      material.opacity = 1 - progress;
    }
  }, [startTime, y]); // Removed x as it's not used in the effect

  return (
    <Text
      anchorX="center"
      anchorY="middle"
      color="lime"
      fontSize={0.8}
      position={[x, y + 1, 3]}
      ref={textRef}
    >
      +1k
      <meshBasicMaterial opacity={1} transparent />
    </Text>
  );
}

function InteractionPlane({
  game,
  width,
  height,
  onClick,
  isBuildMode,
  selectedBuilding,
  selectedTroopId,
  onMoveTroop,
}: {
  game: any;
  width: number;
  height: number;
  onClick: (x: number, y: number) => void;
  isBuildMode?: boolean;
  selectedBuilding?: string | null;
  selectedTroopId?: string | null;
  onMoveTroop?: (x: number, y: number) => void;
}) {
  const { camera, raycaster } = useThree();
  const [hoverPos, setHoverPos] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const planeRef = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    // Active logic: Build Mode OR Defense Mode (selectedTroopId)
    const isDefenseMode = !!selectedTroopId;
    const isActive =
      game.phase === "placement" ||
      (game.phase === "simulation" && (isBuildMode || isDefenseMode));

    if (!isActive) {
      if (hoverPos) {
        setHoverPos(null);
      }
      return;
    }

    raycaster.setFromCamera(state.pointer, camera);

    if (planeRef.current) {
      const hits = raycaster.intersectObject(planeRef.current);
      if (hits.length > 0) {
        const point = hits[0].point;
        const tx = Math.floor(point.x);
        const ty = Math.floor(point.y);
        setHoverPos({ x: tx, y: ty });
      }
    }
  });

  const handleClick = useCallback(
    (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      if (hoverPos) {
        // Priority: Troop Move > Build > Base Place
        if (selectedTroopId && onMoveTroop) {
          onMoveTroop(hoverPos.x, hoverPos.y);
        } else {
          onClick(hoverPos.x, hoverPos.y);
        }
      }
    },
    [hoverPos, selectedTroopId, onMoveTroop, onClick]
  );

  // Cursor Visuals
  let cursorColor = "white";
  let cursorWidth = 1;
  let cursorHeight = 1;

  if (game.phase === "placement") {
    cursorWidth = 5;
    cursorHeight = 5;
    cursorColor = "lime";
  } else if (isBuildMode && selectedBuilding) {
    cursorColor = "cyan";
    switch (selectedBuilding) {
      case "house": {
        cursorWidth = 2;
        cursorHeight = 2;
        break;
      }
      case "workshop": {
        cursorWidth = 4;
        cursorHeight = 4;
        break;
      }
      case "barracks": {
        cursorWidth = 3;
        cursorHeight = 3;
        break;
      }
      default: {
        break;
      }
    }
  } else if (selectedTroopId) {
    cursorColor = "red"; // Target reticle
  }

  return (
    <group>
      <mesh
        onClick={handleClick}
        position={[width / 2, height / 2, 0]}
        ref={planeRef}
        visible={false}
      >
        <planeGeometry args={[width, height]} />
      </mesh>

      {/* Cursor */}
      {hoverPos && (
        <mesh
          position={[
            hoverPos.x + cursorWidth / 2 - 0.5,
            hoverPos.y + cursorHeight / 2 - 0.5,
            0.1,
          ]}
        >
          <boxGeometry args={[cursorWidth, cursorHeight, 0.5]} />
          <meshBasicMaterial
            color={cursorColor}
            opacity={0.5}
            transparent
            wireframe
          />
        </mesh>
      )}

      {/* Target Marker (Click feedback could be added here) */}
    </group>
  );
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
}: ExtendedGameCanvasProps) {
  const placeBase = useMutation(api.game.placeBase);

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

  return (
    <Canvas
      camera={{
        zoom: 20,
        position: [staticMap.width / 2, staticMap.height / 2, 100],
      }}
      className="cursor-crosshair"
      gl={{ antialias: false }} // Pixel look
      orthographic
    >
      <color args={["#000"]} attach="background" />
      <ambientLight intensity={0.5} />
      <directionalLight intensity={1} position={[10, 10, 10]} />

      <MapControls
        enableRotate={false}
        maxZoom={50}
        minZoom={10}
        panSpeed={0.5}
        target={[staticMap.width / 2, staticMap.height / 2, 0]}
        zoomSpeed={0.5}
      />

      <MapRenderer map={staticMap} />
      <StructuresRenderer map={staticMap} />
      <BuildingsRenderer buildings={buildings} entities={entities} />

      {entities && (
        <UnitsRenderer
          entities={entities}
          onSelectTroop={onSelectTroop}
          selectedTroopId={selectedTroopId}
        />
      )}

      {/* Floating income indicators */}
      {entities && <IncomeIndicator entities={entities} />}

      <InteractionPlane
        game={game}
        height={staticMap.height}
        isBuildMode={isBuildMode}
        onClick={handlePlace}
        onMoveTroop={onMoveTroop}
        selectedBuilding={selectedBuilding}
        selectedTroopId={selectedTroopId}
        width={staticMap.width}
      />
    </Canvas>
  );
}
