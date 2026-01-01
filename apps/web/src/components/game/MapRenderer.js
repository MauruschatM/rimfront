import { memo, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createPlanetPalette } from "@/lib/assets";
const TILE_SIZE = 1;
function reassembleTiles(chunks, width, height) {
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
function getTileColor(tileId, palette) {
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
export const MapRenderer = memo(function MapRenderer({ map, }) {
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
    const meshRef = useRef(null);
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
                }
                else {
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
    return (<instancedMesh args={[undefined, undefined, width * height]} ref={meshRef}>
      <planeGeometry args={[TILE_SIZE, TILE_SIZE]}/>
      <meshBasicMaterial color="white" map={noiseTexture || undefined} opacity={0.8} transparent/>
    </instancedMesh>);
});
export function StructuresRenderer({ map }) {
    const palette = useMemo(() => createPlanetPalette(map.planetType), [map.planetType]);
    const structures = map.structures;
    return (<group>
      {structures.map((s, i) => (<mesh key={`${s.type}-${s.x}-${s.y}-${i}`} position={[s.x + s.width / 2 - 0.5, s.y + s.height / 2 - 0.5, 0.1]}>
          <planeGeometry args={[s.width, s.height]}/>
          <meshStandardMaterial color={palette.rock}/>
        </mesh>))}
    </group>);
}
