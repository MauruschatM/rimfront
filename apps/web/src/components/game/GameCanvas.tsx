"use client";

import * as React from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { OrthographicCamera, MapControls } from "@react-three/drei";
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
      console.log("Rendering Map Tiles..."); // Debug log to ensure it runs once

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
  }, [width, height, tiles, palette]); // Only re-run if map geometry changes

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

function BuildingsRenderer({ buildings, players }: { buildings: any[], players: any[] }) {
    return (
        <group>
            {buildings.map((b: any, i: number) => (
                <mesh key={i} position={[b.x + b.width/2 - 0.5, b.y + b.height/2 - 0.5, 0.2]}>
                    <boxGeometry args={[b.width, b.height, 2]} />
                    <meshStandardMaterial color="blue" />
                </mesh>
            ))}
        </group>
    )
}

function PlacementManager({ game, width, height, onPlace }: { game: any, width: number, height: number, onPlace: (x: number, y: number) => void }) {
    const { camera, raycaster, scene } = useThree();
    const [hoverPos, setHoverPos] = React.useState<{x: number, y: number} | null>(null);
    const planeRef = React.useRef<THREE.Mesh>(null);

    useFrame((state) => {
        if (game.phase !== "placement") {
             if (hoverPos) setHoverPos(null);
             return;
        }

        // Raycast against infinite plane at Z=0
        raycaster.setFromCamera(state.pointer, camera);
        const intersects = raycaster.intersectObjects(scene.children, true);

        // Find intersection with the map plane
        // Simplified: just project onto Z=0
        // Or use a dedicated invisible plane
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
        if (hoverPos && game.phase === "placement") {
            onPlace(hoverPos.x, hoverPos.y);
        }
    }

    // Invisible plane for raycasting
    return (
        <group>
             <mesh ref={planeRef} position={[width/2, height/2, 0]} onClick={handleClick} visible={false}>
                 <planeGeometry args={[width, height]} />
             </mesh>

             {/* Cursor */}
             {hoverPos && game.phase === "placement" && (
                 <mesh position={[hoverPos.x + 2, hoverPos.y + 2, 1]}>
                     <boxGeometry args={[5, 5, 0.5]} />
                     <meshBasicMaterial color="lime" transparent opacity={0.5} wireframe />
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

export function GameCanvas({ game, staticMap, buildings, players }: GameCanvasProps) {
  const { data: session } = authClient.useSession();

  const placeBase = useMutation(api.game.placeBase);

  const handlePlaceBase = async (x: number, y: number) => {
      try {
          await placeBase({
              gameId: game._id,
              x,
              y,
          });
      } catch (e) {
          console.error("Failed to place base:", e);
          // Show toast
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
      <BuildingsRenderer buildings={buildings} players={players} />

      <PlacementManager game={game} width={staticMap.width} height={staticMap.height} onPlace={handlePlaceBase} />

    </Canvas>
  );
}
