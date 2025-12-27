"use client";

import * as React from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrthographicCamera, MapControls, Text } from "@react-three/drei";
import * as THREE from "three";
import { createPlanetPalette, generateTileTexture } from "@/lib/assets";
import { useMutation } from "convex/react";
import { api } from "@packages/backend/convex/_generated/api";
import { authClient } from "@/lib/auth-client";

// --- Types ---
interface GameCanvasProps {
  game: any;
  staticMap: any;
  buildings: any[];
  players: any[];
  unitChunks?: any[];
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

// --- Components ---

// Memoized Map Renderer
const MapRenderer = React.memo(function MapRenderer({ map }: { map: any }) {
  const { width, height, tiles, planetType } = map;
  const palette = React.useMemo(() => createPlanetPalette(planetType), [planetType]);

  // Generate a noise texture once
  const noiseTexture = React.useMemo(() => {
     if (typeof document === 'undefined') return null;
     // White texture with alpha noise
     const canvas = document.createElement('canvas');
     canvas.width = 16;
     canvas.height = 16;
     const ctx = canvas.getContext('2d')!;
     ctx.fillStyle = "#ffffff";
     ctx.fillRect(0,0,16,16);

     // Noise
     for(let i=0; i<64; i++) {
        const x = Math.floor(Math.random() * 16);
        const y = Math.floor(Math.random() * 16);
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
        ctx.fillRect(x, y, 1, 1);
     }

     return new THREE.CanvasTexture(canvas);
  }, []);

  // We use InstancedMesh for performance
  const meshRef = React.useRef<THREE.InstancedMesh>(null);

  React.useEffect(() => {
      if (!meshRef.current) return;

      const tempObj = new THREE.Object3D();
      const color = new THREE.Color();

      let i = 0;
      for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
              const tileId = tiles[i];
              if (tileId !== 0) { // Not Empty
                  tempObj.position.set(x * TILE_SIZE, y * TILE_SIZE, 0);
                  tempObj.updateMatrix();
                  meshRef.current.setMatrixAt(i, tempObj.matrix);

                  // Color based on ID
                  switch(tileId) {
                      case 1: color.set(palette.dirt); break;
                      case 2: color.set(palette.sand); break;
                      case 3: color.set(palette.sand); break; // Grass -> fallback
                      case 6: color.set(palette.rock); break;
                      case 7: color.set("#ff3300"); break; // Lava
                      case 4: color.set("#ffffff"); break; // Snow
                      case 5: color.set("#aaffff"); break; // Ice
                      default: color.set(palette.dirt);
                  }
                  meshRef.current.setColorAt(i, color);
              } else {
                  // Hide empty
                  tempObj.position.set(0, 0, -1000); // Move away
                  tempObj.updateMatrix();
                  meshRef.current.setMatrixAt(i, tempObj.matrix);
              }
              i++;
          }
      }
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  }, [width, height, tiles, palette]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, width * height]}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]} />
      <meshBasicMaterial map={noiseTexture} color="white" />
    </instancedMesh>
  );
});

function StructuresRenderer({ map }: { map: any }) {
    const palette = React.useMemo(() => createPlanetPalette(map.planetType), [map.planetType]);

    // Also memoize this if structure list is static
    return (
        <group>
            {map.structures.map((s: any, i: number) => (
                <mesh key={i} position={[s.x + s.width/2 - 0.5, s.y + s.height/2 - 0.5, 0.1]}>
                    <boxGeometry args={[s.width, s.height, 1]} />
                    <meshStandardMaterial color={palette.rock} />
                </mesh>
            ))}
        </group>
    )
}

function BuildingsRenderer({ buildings, unitChunks }: { buildings: any[], unitChunks?: any[] }) {

    // Count workshop occupancy
    const workshopOccupancy = React.useMemo(() => {
        const counts: Record<string, number> = {};
        if (unitChunks) {
            for (const chunk of unitChunks) {
                // Check families
                if (chunk.families) {
                    for (const f of chunk.families) {
                        for (const r of f.members) {
                            if (r.state === "working" && r.workplaceId) {
                                counts[r.workplaceId] = (counts[r.workplaceId] || 0) + 1;
                            }
                        }
                    }
                }
            }
        }
        return counts;
    }, [unitChunks]);

    return (
        <group>
            {buildings.map((b: any, i: number) => {
                const isUnderConstruction = b.constructionEnd && b.constructionEnd > Date.now();
                const occupancy = workshopOccupancy[b.id] || 0;
                const isLowStaff = b.type === "workshop" && occupancy < 1;

                return (
                    <group key={i}>
                        <mesh position={[b.x + b.width/2 - 0.5, b.y + b.height/2 - 0.5, 0.2]}>
                            <boxGeometry args={[b.width, b.height, 2]} />
                            <meshStandardMaterial
                                color={isUnderConstruction ? "orange" : "blue"}
                                wireframe={isUnderConstruction}
                            />
                        </mesh>
                        {/* Status for Under Construction */}
                        {isUnderConstruction && (
                            <mesh position={[b.x + b.width/2 - 0.5, b.y + b.height/2 - 0.5, 1.5]}>
                                <boxGeometry args={[b.width * 0.8, b.height * 0.8, 0.1]} />
                                <meshBasicMaterial color="yellow" transparent opacity={0.5} />
                            </mesh>
                        )}
                        {/* Status for Low Staff */}
                        {isLowStaff && !isUnderConstruction && (
                             <Text
                                position={[b.x + b.width/2 - 0.5, b.y + b.height + 1, 2]}
                                fontSize={2}
                                color="red"
                                anchorX="center"
                                anchorY="middle"
                             >
                                 !
                             </Text>
                        )}
                    </group>
                );
            })}
        </group>
    )
}

function UnitsRenderer({ unitChunks, selectedTroopId, onSelectTroop }: { unitChunks: any[], selectedTroopId?: string | null, onSelectTroop?: (id: string | null) => void }) {

    // Group all units for rendering
    // We will use 3 distinct meshes: Families (Sphere), Commanders (Box), Soldiers (Smaller Box)
    const familiesRef = React.useRef<THREE.InstancedMesh>(null);
    const commandersRef = React.useRef<THREE.InstancedMesh>(null);
    const soldiersRef = React.useRef<THREE.InstancedMesh>(null);

    const { families, commanders, soldiers } = React.useMemo(() => {
        const families: any[] = [];
        const commanders: any[] = [];
        const soldiers: any[] = [];

        for (const chunk of unitChunks) {
            // Families
            if (chunk.families) {
                for (const f of chunk.families) {
                    families.push(...f.members);
                }
            }
            // Troops
            if (chunk.troops) {
                for (const t of chunk.troops) {
                    // Attach troop ID to member for selection
                    const cmd = { ...t.commander, troopId: t.id, type: 'commander' };
                    commanders.push(cmd);

                    for (const s of t.soldiers) {
                        soldiers.push({ ...s, troopId: t.id, type: 'soldier' });
                    }
                }
            }
        }
        return { families, commanders, soldiers };
    }, [unitChunks]);

    // Handle Clicks
    // Since we use InstancedMesh, we can't attach onClick easily to individual instances without raycasting logic.
    // But `onClick` on InstancedMesh returns instanceId.

    const handleUnitClick = (e: any, list: any[]) => {
        if (!onSelectTroop) return;
        e.stopPropagation();
        const instanceId = e.instanceId;
        if (instanceId !== undefined && list[instanceId]) {
             const unit = list[instanceId];
             if (unit.troopId) {
                 onSelectTroop(unit.troopId);
             }
        }
    };

    // Update Families
    React.useEffect(() => {
        if (!familiesRef.current) return;
        const tempObj = new THREE.Object3D();
        const color = new THREE.Color();

        families.forEach((r, i) => {
            tempObj.position.set(r.x, r.y, 0.5);
            tempObj.scale.set(0.5, 0.5, 0.5);
            tempObj.updateMatrix();
            familiesRef.current!.setMatrixAt(i, tempObj.matrix);

            if (r.state === "working") color.set("lime");
            else if (r.state === "sleeping") color.set("blue");
            else color.set("white");

            familiesRef.current!.setColorAt(i, color);
        });
        familiesRef.current.instanceMatrix.needsUpdate = true;
        if (familiesRef.current.instanceColor) familiesRef.current.instanceColor.needsUpdate = true;
    }, [families]);

    // Update Commanders
    React.useEffect(() => {
        if (!commandersRef.current) return;
        const tempObj = new THREE.Object3D();
        const color = new THREE.Color();

        commanders.forEach((c, i) => {
            tempObj.position.set(c.x, c.y, 1); // Taller
            tempObj.scale.set(0.8, 0.8, 0.8);
            tempObj.updateMatrix();
            commandersRef.current!.setMatrixAt(i, tempObj.matrix);

            // Highlight selected
            if (selectedTroopId && c.troopId === selectedTroopId) {
                color.set("yellow");
            } else {
                color.set("red");
            }

            commandersRef.current!.setColorAt(i, color);
        });
        commandersRef.current.instanceMatrix.needsUpdate = true;
        if (commandersRef.current.instanceColor) commandersRef.current.instanceColor.needsUpdate = true;
    }, [commanders, selectedTroopId]);

    // Update Soldiers
    React.useEffect(() => {
        if (!soldiersRef.current) return;
        const tempObj = new THREE.Object3D();
        const color = new THREE.Color();

        soldiers.forEach((s, i) => {
            tempObj.position.set(s.x, s.y, 0.5);
            tempObj.scale.set(0.4, 0.4, 0.4);
            tempObj.updateMatrix();
            soldiersRef.current!.setMatrixAt(i, tempObj.matrix);

            if (selectedTroopId && s.troopId === selectedTroopId) {
                color.set("orange"); // Selected troop soldiers
            } else {
                color.set("maroon");
            }

            soldiersRef.current!.setColorAt(i, color);
        });
        soldiersRef.current.instanceMatrix.needsUpdate = true;
        if (soldiersRef.current.instanceColor) soldiersRef.current.instanceColor.needsUpdate = true;
    }, [soldiers, selectedTroopId]);

    return (
        <group>
            {/* Families */}
            {families.length > 0 && (
                <instancedMesh ref={familiesRef} args={[undefined, undefined, families.length]}>
                    <sphereGeometry args={[0.4, 8, 8]} />
                    <meshBasicMaterial />
                </instancedMesh>
            )}
            {/* Commanders */}
            {commanders.length > 0 && (
                <instancedMesh
                    ref={commandersRef}
                    args={[undefined, undefined, commanders.length]}
                    onClick={(e) => handleUnitClick(e, commanders)}
                    onPointerOver={() => document.body.style.cursor = 'pointer'}
                    onPointerOut={() => document.body.style.cursor = 'default'}
                >
                    <boxGeometry args={[1, 1, 2]} />
                    <meshStandardMaterial />
                </instancedMesh>
            )}
            {/* Soldiers */}
            {soldiers.length > 0 && (
                <instancedMesh
                    ref={soldiersRef}
                    args={[undefined, undefined, soldiers.length]}
                    onClick={(e) => handleUnitClick(e, soldiers)}
                >
                    <boxGeometry args={[0.8, 0.8, 1]} />
                    <meshStandardMaterial />
                </instancedMesh>
            )}
        </group>
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
    onMoveTroop
}: {
    game: any,
    width: number,
    height: number,
    onClick: (x: number, y: number) => void,
    isBuildMode?: boolean,
    selectedBuilding?: string | null,
    selectedTroopId?: string | null,
    onMoveTroop?: (x: number, y: number) => void
}) {
    const { camera, raycaster } = useThree();
    const [hoverPos, setHoverPos] = React.useState<{x: number, y: number} | null>(null);
    const planeRef = React.useRef<THREE.Mesh>(null);

    // Find the troop target for visualization
    const troopTarget = React.useMemo(() => {
        if (!selectedTroopId || !game) return null;
        // In a real app we would pass residentChunks to this component to find the target.
        // For now, let's skip complex target viz here or pass it down if needed.
        return null;
    }, [selectedTroopId, game]);

    useFrame((state) => {
        // Active logic: Build Mode OR Defense Mode (selectedTroopId)
        const isDefenseMode = !!selectedTroopId;
        const isActive = game.phase === "placement" || (game.phase === "simulation" && (isBuildMode || isDefenseMode));

        if (!isActive) {
             if (hoverPos) setHoverPos(null);
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

    const handleClick = (e: any) => {
        e.stopPropagation();
        if (hoverPos) {
            // Priority: Troop Move > Build > Base Place
            if (selectedTroopId && onMoveTroop) {
                onMoveTroop(hoverPos.x, hoverPos.y);
            } else {
                onClick(hoverPos.x, hoverPos.y);
            }
        }
    }

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
        switch(selectedBuilding) {
            case "house": cursorWidth = 2; cursorHeight = 2; break;
            case "workshop": cursorWidth = 4; cursorHeight = 4; break;
            case "barracks": cursorWidth = 3; cursorHeight = 3; break;
        }
    } else if (selectedTroopId) {
        cursorColor = "red"; // Target reticle
    }

    return (
        <group>
             <mesh ref={planeRef} position={[width/2, height/2, 0]} onClick={handleClick} visible={false}>
                 <planeGeometry args={[width, height]} />
             </mesh>

             {/* Cursor */}
             {hoverPos && (
                 <mesh position={[hoverPos.x + cursorWidth/2 - 0.5, hoverPos.y + cursorHeight/2 - 0.5, 0.1]}>
                     <boxGeometry args={[cursorWidth, cursorHeight, 0.5]} />
                     <meshBasicMaterial color={cursorColor} transparent opacity={0.5} wireframe />
                 </mesh>
             )}

             {/* Target Marker (Click feedback could be added here) */}
        </group>
    )
}

export function GameCanvas({ game, staticMap, buildings, players, unitChunks, isBuildMode, selectedBuilding, onPlaceBuilding, selectedTroopId, onSelectTroop, onMoveTroop }: ExtendedGameCanvasProps) {
  const { data: session } = authClient.useSession();
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
        orthographic
        camera={{ zoom: 20, position: [staticMap.width/2, staticMap.height/2, 100] }}
        gl={{ antialias: false }} // Pixel look
        className="cursor-crosshair"
    >
      <color attach="background" args={['#000']} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 10]} intensity={1} />

      <MapControls
        enableRotate={false}
        panSpeed={0.5}
        zoomSpeed={0.5}
        minZoom={10}
        maxZoom={50}
        target={[staticMap.width/2, staticMap.height/2, 0]}
      />

      <MapRenderer map={staticMap} />
      <StructuresRenderer map={staticMap} />
      <BuildingsRenderer buildings={buildings} unitChunks={unitChunks} />

      {unitChunks && (
          <UnitsRenderer
            unitChunks={unitChunks}
            selectedTroopId={selectedTroopId}
            onSelectTroop={onSelectTroop}
          />
      )}

      <InteractionPlane
        game={game}
        width={staticMap.width}
        height={staticMap.height}
        onClick={handlePlace}
        isBuildMode={isBuildMode}
        selectedBuilding={selectedBuilding}
        selectedTroopId={selectedTroopId}
        onMoveTroop={onMoveTroop}
      />

    </Canvas>
  );
}
