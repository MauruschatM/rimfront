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
  residentChunks?: any[];
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
      // console.log("Rendering Map Tiles...");

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

function BuildingsRenderer({ buildings, residentChunks }: { buildings: any[], residentChunks?: any[] }) {

    // Count workshop occupancy
    const workshopOccupancy = React.useMemo(() => {
        const counts: Record<string, number> = {};
        if (residentChunks) {
            for (const chunk of residentChunks) {
                for (const r of chunk.residents) {
                    if (r.state === "working" && r.workplaceId) {
                        counts[r.workplaceId] = (counts[r.workplaceId] || 0) + 1;
                    }
                }
            }
        }
        return counts;
    }, [residentChunks]);

    return (
        <group>
            {buildings.map((b: any, i: number) => {
                const isUnderConstruction = b.constructionEnd && b.constructionEnd > Date.now();
                const occupancy = workshopOccupancy[b.id] || 0;
                const isLowStaff = b.type === "workshop" && occupancy < 1; // "Not enough" -> less than 1 or full? User said exclaim if not enough. Assuming < 1 for now or < Max.
                // A workshop needs workers. Empty is bad.

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

function ResidentsRenderer({ residentChunks }: { residentChunks: any[] }) {
    const meshRef = React.useRef<THREE.InstancedMesh>(null);
    const count = React.useMemo(() => residentChunks.reduce((acc, c) => acc + c.residents.length, 0), [residentChunks]);

    // Flatten
    const residents = React.useMemo(() => {
        return residentChunks.flatMap(c => c.residents);
    }, [residentChunks]);

    // OPTIMIZATION: Use useEffect instead of useFrame to update instances only when data changes.
    // Since we are snapping to tiles (server authoritative) and not interpolating client-side,
    // we do not need 60FPS updates. This saves massive CPU for 10,000 units.
    React.useEffect(() => {
        if (!meshRef.current) return;
        const tempObj = new THREE.Object3D();
        const color = new THREE.Color();

        residents.forEach((r, i) => {
            tempObj.position.set(r.x, r.y, 0.5);
            tempObj.scale.set(0.5, 0.5, 0.5);
            tempObj.updateMatrix();
            meshRef.current!.setMatrixAt(i, tempObj.matrix);

            if (r.state === "working") color.set("lime");
            else if (r.state === "sleeping") color.set("blue");
            else if (r.state === "commute_work") color.set("yellow");
            else if (r.state === "commute_home") color.set("orange");
            else color.set("white"); // idle

            meshRef.current!.setColorAt(i, color);
        });

        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }, [residents]); // Depend on flattened residents array

    if (count === 0) return null;

    return (
        <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
            <sphereGeometry args={[0.4, 8, 8]} />
            <meshBasicMaterial />
        </instancedMesh>
    );
}


function PlacementManager({
    game,
    width,
    height,
    onPlace,
    isBuildMode,
    selectedBuilding
}: {
    game: any,
    width: number,
    height: number,
    onPlace: (x: number, y: number) => void,
    isBuildMode?: boolean,
    selectedBuilding?: string | null
}) {
    const { camera, raycaster, scene } = useThree();
    const [hoverPos, setHoverPos] = React.useState<{x: number, y: number} | null>(null);
    const planeRef = React.useRef<THREE.Mesh>(null);

    useFrame((state) => {
        // Active if in placement phase OR in build mode during simulation
        const isActive = game.phase === "placement" || (game.phase === "simulation" && isBuildMode);

        if (!isActive) {
             if (hoverPos) setHoverPos(null);
             return;
        }

        // Raycast against infinite plane at Z=0
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

    const handleClick = () => {
        if (hoverPos) {
            if (game.phase === "placement") {
                onPlace(hoverPos.x, hoverPos.y);
            } else if (game.phase === "simulation" && isBuildMode) {
                onPlace(hoverPos.x, hoverPos.y);
            }
        }
    }

    // Determine cursor size
    let cursorWidth = 1;
    let cursorHeight = 1;

    if (game.phase === "placement") {
        cursorWidth = 5;
        cursorHeight = 5;
    } else if (selectedBuilding) {
        switch(selectedBuilding) {
            case "house": cursorWidth = 2; cursorHeight = 2; break;
            case "workshop": cursorWidth = 4; cursorHeight = 4; break;
            case "barracks": cursorWidth = 3; cursorHeight = 3; break;
        }
    }

    // Invisible plane for raycasting
    return (
        <group>
             <mesh ref={planeRef} position={[width/2, height/2, 0]} onClick={handleClick} visible={false}>
                 <planeGeometry args={[width, height]} />
             </mesh>

             {/* Cursor */}
             {hoverPos && (
                 <mesh position={[hoverPos.x + cursorWidth/2 - 0.5, hoverPos.y + cursorHeight/2 - 0.5, 1]}>
                     <boxGeometry args={[cursorWidth, cursorHeight, 0.5]} />
                     <meshBasicMaterial color={isBuildMode ? "cyan" : "lime"} transparent opacity={0.5} wireframe />
                 </mesh>
             )}
        </group>
    )
}

// Helper for texture gen (client side only)
function generateTileCanvas(color: string) {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = color;
    ctx.fillRect(0,0,16,16);
    return canvas;
}

interface ExtendedGameCanvasProps extends GameCanvasProps {
    isBuildMode?: boolean;
    selectedBuilding?: string | null;
    onPlaceBuilding?: (type: string, x: number, y: number) => void;
}

export function GameCanvas({ game, staticMap, buildings, players, residentChunks, isBuildMode, selectedBuilding, onPlaceBuilding }: ExtendedGameCanvasProps) {
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
        // Restrict bounds roughly
        target={[staticMap.width/2, staticMap.height/2, 0]}
      />

      <MapRenderer map={staticMap} />
      <StructuresRenderer map={staticMap} />
      <BuildingsRenderer buildings={buildings} residentChunks={residentChunks} players={players} />
      {residentChunks && <ResidentsRenderer residentChunks={residentChunks} />}

      <PlacementManager
        game={game}
        width={staticMap.width}
        height={staticMap.height}
        onPlace={handlePlace}
        isBuildMode={isBuildMode}
        selectedBuilding={selectedBuilding}
      />

    </Canvas>
  );
}
