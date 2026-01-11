import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { memo, useRef, useState } from "react";
import type { Mesh } from "three";

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

const FACTORY_CAPACITY = 16;
const HOUSE_CAPACITY = 4;
const BARRACKS_CAPACITY = 4;
const SPAWN_INTERVAL_MS = 30_000;

function getBuildingIcon(type: string): string {
  switch (type) {
    case "house":
      return "🏠";
    case "workshop":
      return "🏭";
    case "barracks":
      return "⚔️";
    case "base_central":
      return "👑";
    case "wall":
      return "🧱";
    case "turret":
      return "🔫";
    default:
      return "🏢";
  }
}

function getBuildingCapacity(type: string): number {
  switch (type) {
    case "house":
      return HOUSE_CAPACITY;
    case "workshop":
      return FACTORY_CAPACITY;
    case "barracks":
      return BARRACKS_CAPACITY;
    case "base_central":
      return 0;
    default:
      return 0;
  }
}

// Optimized SpawnTimer component
// Updates only the text when seconds change, without re-rendering the parent
const SpawnTimer = memo(({ lastSpawnTime }: { lastSpawnTime: number }) => {
  const [seconds, setSeconds] = useState(0);

  useFrame(() => {
    const now = Date.now();
    const nextSpawnAt = lastSpawnTime + SPAWN_INTERVAL_MS;
    const timeToSpawn = Math.max(0, Math.ceil((nextSpawnAt - now) / 1000));
    // Only trigger re-render if value changes
    if (timeToSpawn !== seconds) {
      setSeconds(timeToSpawn);
    }
  });

  return (
    <Text
      anchorX="left"
      anchorY="top"
      color="#94a3b8"
      fontSize={0.6}
      position={[1.3, -0.8, 2.7]}
    >
      {seconds}s
    </Text>
  );
});

// Optimized CaptureBar component
// Uses useFrame for smooth 60fps animation without React re-renders
const CaptureBar = memo(
  ({
    captureStart,
    type,
    height,
  }: {
    captureStart: number;
    type: string;
    height: number;
  }) => {
    const barRef = useRef<Mesh>(null);
    const captureTime = type === "base_central" ? 30_000 : 5000;

    useFrame(() => {
      if (barRef.current) {
        const progress = Math.min((Date.now() - captureStart) / captureTime, 1);
        // Scale and position directly for performance
        const width = progress * 3;
        barRef.current.scale.x = width;
        barRef.current.position.x = -1.5 + width / 2;
      }
    });

    // Position relative to the building center (which is at 0,0 in the parent group)
    // The building height is used to place it above
    return (
      <group position={[0, height / 2 + 1.5, 3]}>
        {/* Background */}
        <mesh position={[0, 0, 0]}>
          <planeGeometry args={[3, 0.4]} />
          <meshBasicMaterial color="black" />
        </mesh>
        {/* Progress Bar - Start with width 1 and scale it */}
        <mesh position={[-1.5, 0, 0.1]} ref={barRef}>
          <planeGeometry args={[1, 0.3]} />
          <meshBasicMaterial color="red" />
        </mesh>
        {/* "CAPTURE" label */}
        <Text
          anchorX="center"
          anchorY="bottom"
          color="red"
          fontSize={0.4}
          position={[0, 0.4, 0.1]}
        >
          CAPTURE
        </Text>
      </group>
    );
  }
);

// Memoized Building Item to prevent re-renders of static geometry
const BuildingItem = memo(
  ({
    b,
    stat,
  }: {
    b: Building;
    stat: {
      active: number;
      working: number;
      sleeping: number;
      total: number;
      assigned?: number; // Made optional to match stats prop type
      lastSpawnTime?: number;
    };
  }) => {
    const isUnderConstruction =
      b.constructionEnd && b.constructionEnd > Date.now();
    const capacity = getBuildingCapacity(b.type);
    const icon = getBuildingIcon(b.type);

    const showSpawnTimer =
      (b.type === "house" || b.type === "barracks") && stat.total < capacity;

    // Building center position
    const centerX = b.x + b.width / 2 - 0.5;
    const centerY = b.y + b.height / 2 - 0.5;

    // Visuals based on type
    let color = "blue";
    if (b.type === "wall") {
      color = "#57534e"; // Stone gray
    }
    if (b.type === "turret") {
      color = "#374151"; // Dark gray base
    }
    if (isUnderConstruction) {
      color = "orange";
    }

    return (
      <group position={[centerX, centerY, 0]}>
        {/* Building mesh */}
        <mesh position={[0, 0, 0.2]}>
          <planeGeometry args={[b.width, b.height]} />
          <meshStandardMaterial
            color={color}
            wireframe={!!isUnderConstruction}
          />
        </mesh>

        {/* Construction overlay */}
        {isUnderConstruction && (
          <mesh position={[0, 0, 1.5]}>
            <planeGeometry args={[b.width * 0.8, b.height * 0.8]} />
            <meshBasicMaterial color="yellow" opacity={0.5} transparent />
          </mesh>
        )}

        {/* Building Icon (centered) */}
        {!isUnderConstruction && (
          <>
            {/* Icon circle background */}
            <mesh position={[0, 0, 2.5]}>
              <circleGeometry args={[1.2, 32]} />
              <meshBasicMaterial color="#1a1a2e" opacity={0.9} transparent />
            </mesh>
            {/* Icon text */}
            <Text
              anchorX="center"
              anchorY="middle"
              fontSize={1.5}
              position={[0, 0, 2.6]}
            >
              {icon}
            </Text>

            {/* Top-Right Info (Total/Capacity or Assigned/Capacity) */}
            {capacity > 0 && (
              <Text
                anchorX="left"
                anchorY="bottom"
                color={
                  (b.type === "workshop" ? stat.assigned || 0 : stat.total) >=
                  capacity
                    ? "#ef4444"
                    : "#4ade80"
                }
                fontSize={0.8}
                position={[1.3, 0.8, 2.7]}
              >
                {b.type === "workshop"
                  ? `${stat.assigned || 0}/${capacity}`
                  : `${stat.total}/${capacity}`}
              </Text>
            )}

            {/* Bottom-Right: Spawn Timer */}
            {showSpawnTimer && (
              <SpawnTimer lastSpawnTime={stat.lastSpawnTime || 0} />
            )}

            {/* Bottom-Left: Inside Count */}
            {(b.type === "house" || b.type === "workshop") && (
              <Text
                anchorX="right"
                anchorY="top"
                color={
                  (b.type === "workshop" ? stat.working > 0 : stat.sleeping > 0)
                    ? "#fbbf24"
                    : "#60a5fa"
                }
                fontSize={0.6}
                position={[-1.3, -0.8, 2.7]}
              >
                {b.type === "workshop"
                  ? `⚙${stat.working}`
                  : `💤${stat.sleeping}`}
              </Text>
            )}
          </>
        )}

        {/* Capture Progress Bar */}
        {b.captureStart && (
          <CaptureBar
            captureStart={b.captureStart}
            height={b.height}
            type={b.type}
          />
        )}
      </group>
    );
  }
);

export function BuildingsRenderer({
  buildings,
  stats,
}: {
  buildings: Building[];
  stats: Record<
    string,
    {
      active: number;
      working: number;
      sleeping: number;
      total: number;
      assigned?: number;
      lastSpawnTime?: number;
    }
  >;
}) {
  return (
    <group>
      {buildings.map((b) => (
        <BuildingItem
          b={b}
          key={b.id}
          stat={
            stats[b.id] || {
              active: 0,
              working: 0,
              sleeping: 0,
              total: 0,
              assigned: 0,
            }
          }
        />
      ))}
    </group>
  );
}
