import {
  BARRACKS_CAPACITY,
  BUILDING_TYPES,
  FACTORY_CAPACITY,
  HOUSE_CAPACITY,
  SPAWN_INTERVAL_MS,
} from "@packages/backend/convex/lib/constants";
import { Text } from "@react-three/drei";
import { useEffect, useState } from "react";

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

function getBuildingIcon(type: string): string {
  switch (type) {
    case BUILDING_TYPES.HOUSE:
      return "🏠";
    case BUILDING_TYPES.WORKSHOP:
      return "🏭";
    case BUILDING_TYPES.BARRACKS:
      return "⚔️";
    case BUILDING_TYPES.CENTRAL_BASE:
      return "👑";
    case BUILDING_TYPES.WALL:
      return "🧱";
    case BUILDING_TYPES.TURRET:
      return "🔫";
    default:
      return "🏢";
  }
}

function getBuildingCapacity(type: string): number {
  switch (type) {
    case BUILDING_TYPES.HOUSE:
      return HOUSE_CAPACITY;
    case BUILDING_TYPES.WORKSHOP:
      return FACTORY_CAPACITY;
    case BUILDING_TYPES.BARRACKS:
      return BARRACKS_CAPACITY;
    case BUILDING_TYPES.CENTRAL_BASE:
      return 0;
    default:
      return 0;
  }
}

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
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <group>
      {buildings.map((b) => {
        const isUnderConstruction =
          b.constructionEnd && b.constructionEnd > Date.now();
        const stat = stats[b.id] || {
          active: 0,
          working: 0,
          sleeping: 0,
          total: 0,
          assigned: 0,
        };
        const capacity = getBuildingCapacity(b.type);
        const icon = getBuildingIcon(b.type);

        // Calculate spawn timer
        const now = Date.now();
        const lastSpawn = stat.lastSpawnTime || 0;
        const nextSpawnAt = lastSpawn + SPAWN_INTERVAL_MS;
        const timeToSpawn = Math.max(0, Math.ceil((nextSpawnAt - now) / 1000));
        const showSpawnTimer =
          (b.type === BUILDING_TYPES.HOUSE ||
            b.type === BUILDING_TYPES.BARRACKS) &&
          stat.total < capacity;

        // Building center position
        const centerX = b.x + b.width / 2 - 0.5;
        const centerY = b.y + b.height / 2 - 0.5;

        // Visuals based on type
        let color = "blue";
        if (b.type === BUILDING_TYPES.WALL) color = "#57534e"; // Stone gray
        if (b.type === BUILDING_TYPES.TURRET) color = "#374151"; // Dark gray base
        if (isUnderConstruction) color = "orange";

        return (
          <group key={b.id}>
            {/* Building mesh */}
            <mesh position={[centerX, centerY, 0.2]}>
              <planeGeometry args={[b.width, b.height]} />
              <meshStandardMaterial
                color={color}
                wireframe={!!isUnderConstruction}
              />
            </mesh>

            {/* Construction overlay */}
            {isUnderConstruction && (
              <mesh position={[centerX, centerY, 1.5]}>
                <planeGeometry args={[b.width * 0.8, b.height * 0.8]} />
                <meshBasicMaterial color="yellow" opacity={0.5} transparent />
              </mesh>
            )}

            {/* Building Icon (centered) */}
            {!isUnderConstruction && (
              <>
                {/* Icon circle background */}
                <mesh position={[centerX, centerY, 2.5]}>
                  <circleGeometry args={[1.2, 32]} />
                  <meshBasicMaterial
                    color="#1a1a2e"
                    opacity={0.9}
                    transparent
                  />
                </mesh>
                {/* Icon text */}
                <Text
                  anchorX="center"
                  anchorY="middle"
                  fontSize={1.5}
                  position={[centerX, centerY, 2.6]}
                >
                  {icon}
                </Text>

                {/* Top-Right Info (Total/Capacity or Assigned/Capacity) */}
                {capacity > 0 && (
                  <Text
                    anchorX="left"
                    anchorY="bottom"
                    color={
                      (b.type === BUILDING_TYPES.WORKSHOP
                        ? stat.assigned || 0
                        : stat.total) >= capacity
                        ? "#ef4444"
                        : "#4ade80"
                    }
                    fontSize={0.8}
                    position={[centerX + 1.3, centerY + 0.8, 2.7]}
                  >
                    {b.type === BUILDING_TYPES.WORKSHOP
                      ? `${stat.assigned || 0}/${capacity}`
                      : `${stat.total}/${capacity}`}
                  </Text>
                )}

                {/* Bottom-Right: Spawn Timer */}
                {showSpawnTimer && (
                  <Text
                    anchorX="left"
                    anchorY="top"
                    color="#94a3b8"
                    fontSize={0.6}
                    position={[centerX + 1.3, centerY - 0.8, 2.7]}
                  >
                    {timeToSpawn}s
                  </Text>
                )}

                {/* Bottom-Left: Inside Count */}
                {(b.type === BUILDING_TYPES.HOUSE ||
                  b.type === BUILDING_TYPES.WORKSHOP) && (
                  <Text
                    anchorX="right"
                    anchorY="top"
                    color={
                      (
                        b.type === BUILDING_TYPES.WORKSHOP
                          ? stat.working > 0
                          : stat.sleeping > 0
                      )
                        ? "#fbbf24"
                        : "#60a5fa"
                    }
                    fontSize={0.6}
                    position={[centerX - 1.3, centerY - 0.8, 2.7]}
                  >
                    {b.type === BUILDING_TYPES.WORKSHOP
                      ? `⚙${stat.working}`
                      : `💤${stat.sleeping}`}
                  </Text>
                )}
              </>
            )}

            {/* Capture Progress Bar */}
            {b.captureStart && (
              <group position={[centerX, b.y + b.height + 1.5, 3]}>
                {/* Background */}
                <mesh position={[0, 0, 0]}>
                  <planeGeometry args={[3, 0.4]} />
                  <meshBasicMaterial color="black" />
                </mesh>
                {/* Progress (5s for buildings, 30s for bases) */}
                {(() => {
                  const captureTime =
                    b.type === BUILDING_TYPES.CENTRAL_BASE ? 30_000 : 5000;
                  const progress = Math.min(
                    (Date.now() - b.captureStart) / captureTime,
                    1
                  );
                  return (
                    <mesh position={[-1.5 + (progress * 3) / 2, 0, 0.1]}>
                      <planeGeometry args={[progress * 3, 0.3]} />
                      <meshBasicMaterial color="red" />
                    </mesh>
                  );
                })()}
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
            )}
          </group>
        );
      })}
    </group>
  );
}
