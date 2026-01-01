import { Text } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export function IncomeIndicator({
  workingEntities,
}: {
  workingEntities: Array<{ id: string; x: number; y: number }>;
}) {
  const [indicators, setIndicators] = useState<
    Array<{ id: string; x: number; y: number; startTime: number }>
  >([]);

  useEffect(() => {
    const now = Date.now();
    const newIndicators: Array<{
      id: string;
      x: number;
      y: number;
      startTime: number;
    }> = [];

    for (const worker of workingEntities) {
      if (Math.random() < 0.3) {
        newIndicators.push({
          id: `${worker.id}-${now}`,
          x: worker.x,
          y: worker.y,
          startTime: now,
        });
      }
    }

    if (newIndicators.length > 0) {
      setIndicators((prev) => [...prev.slice(-10), ...newIndicators]);
    }
  }, [workingEntities]);

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

export function EnergyRenderer({ validTiles }: { validTiles: Set<string> }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const tilesArray = useMemo(() => Array.from(validTiles), [validTiles]);

  useEffect(() => {
    if (!meshRef.current) return;
    const tempObj = new THREE.Object3D();

    tilesArray.forEach((key, i) => {
      if (key === "ALL") return;
      const [x, y] = key.split(",").map(Number);
      tempObj.position.set(x, y, 0.1);
      tempObj.updateMatrix();
      meshRef.current!.setMatrixAt(i, tempObj.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [tilesArray]);

  if (validTiles.has("ALL") || validTiles.size === 0) return null;

  return (
    <instancedMesh
      args={[undefined, undefined, tilesArray.length]}
      ref={meshRef}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial color="#4ade80" opacity={0.3} transparent />
    </instancedMesh>
  );
}

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
  }, [startTime, y]);

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
