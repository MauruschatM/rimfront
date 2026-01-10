import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Mesh } from "three";
import type { Building, BuildingStats } from "./types";

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

function SpawnTimer({
  lastSpawnTime,
  position,
}: {
  lastSpawnTime: number;
  position: [number, number, number];
}) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const update = () => {
      const now = Date.now();
      const nextSpawnAt = lastSpawnTime + SPAWN_INTERVAL_MS;
      const t = Math.max(0, Math.ceil((nextSpawnAt - now) / 1000));
      setTimeLeft(t);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [lastSpawnTime]);

  if (timeLeft <= 0) {
    return (
      <Text
        anchorX="left"
        anchorY="top"
        color="#94a3b8"
        fontSize={0.6}
        position={position}
      >
        0s
      </Text>
    );
  }

  return (
    <Text
      anchorX="left"
      anchorY="top"
      color="#94a3b8"
      fontSize={0.6}
      position={position}
    >
      {timeLeft}s
    </Text>
  );
}

function CaptureBar({
  captureStart,
  type,
  position,
}: {
  captureStart: number;
  type: string;
  position: [number, number, number];
}) {
  const barRef = useRef<Mesh>(null);
  const captureTime = type === "base_central" ? 30_000 : 5000;

  useFrame(() => {
    if (barRef.current) {
      const progress = Math.min((Date.now() - captureStart) / captureTime, 1);
      const targetWidth = progress * 3;
      barRef.current.scale.x = targetWidth;
      barRef.current.position.x = -1.5 + targetWidth / 2;
    }
  });

  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <planeGeometry args={[3, 0.4]} />
        <meshBasicMaterial color="black" />
      </mesh>
      <mesh position={[-1.5, 0, 0.1]} ref={barRef}>
        <planeGeometry args={[1, 0.3]} />
        <meshBasicMaterial color="red" />
      </mesh>
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

function BuildingMesh({
  building,
  isUnderConstruction,
  centerX,
  centerY,
}: {
  building: Building;
  isUnderConstruction: boolean;
  centerX: number;
  centerY: number;
}) {
  let color = "blue";
  if (isUnderConstruction) {
    color = "orange";
  } else if (building.type === "wall") {
    color = "#57534e"; // Stone gray
  } else if (building.type === "turret") {
    color = "#374151"; // Dark gray base
  }

  return (
    <>
      <mesh position={[centerX, centerY, 0.2]}>
        <planeGeometry args={[building.width, building.height]} />
        <meshStandardMaterial color={color} wireframe={!!isUnderConstruction} />
      </mesh>
      {isUnderConstruction && (
        <mesh position={[centerX, centerY, 1.5]}>
          <planeGeometry args={[building.width * 0.8, building.height * 0.8]} />
          <meshBasicMaterial color="yellow" opacity={0.5} transparent />
        </mesh>
      )}
    </>
  );
}

function BuildingInfo({
  building,
  stat,
  capacity,
  icon,
  centerX,
  centerY,
}: {
  building: Building;
  stat: BuildingStats;
  capacity: number;
  icon: string;
  centerX: number;
  centerY: number;
}) {
  const showSpawnTimer =
    (building.type === "house" || building.type === "barracks") &&
    stat.total < capacity;

  // Calculate Capacity Color and Text
  const currentCount =
    building.type === "workshop" ? stat.assigned || 0 : stat.total;
  const isFull = currentCount >= capacity;
  const capacityColor = isFull ? "#ef4444" : "#4ade80";
  const capacityText = `${currentCount}/${capacity}`;

  // Calculate Inside Count Color and Text
  const insideCount =
    building.type === "workshop" ? stat.working : stat.sleeping;
  const hasInside = insideCount > 0;
  const insideColor = hasInside ? "#fbbf24" : "#60a5fa";
  const insideText =
    building.type === "workshop" ? `⚙${insideCount}` : `💤${insideCount}`;
  const showInsideCount =
    building.type === "house" || building.type === "workshop";

  return (
    <>
      <mesh position={[centerX, centerY, 2.5]}>
        <circleGeometry args={[1.2, 32]} />
        <meshBasicMaterial color="#1a1a2e" opacity={0.9} transparent />
      </mesh>
      <Text
        anchorX="center"
        anchorY="middle"
        fontSize={1.5}
        position={[centerX, centerY, 2.6]}
      >
        {icon}
      </Text>

      {capacity > 0 && (
        <Text
          anchorX="left"
          anchorY="bottom"
          color={capacityColor}
          fontSize={0.8}
          position={[centerX + 1.3, centerY + 0.8, 2.7]}
        >
          {capacityText}
        </Text>
      )}

      {showSpawnTimer && (
        <SpawnTimer
          lastSpawnTime={stat.lastSpawnTime || 0}
          position={[centerX + 1.3, centerY - 0.8, 2.7]}
        />
      )}

      {showInsideCount && (
        <Text
          anchorX="right"
          anchorY="top"
          color={insideColor}
          fontSize={0.6}
          position={[centerX - 1.3, centerY - 0.8, 2.7]}
        >
          {insideText}
        </Text>
      )}
    </>
  );
}

function BuildingItem({
  building,
  stats,
}: {
  building: Building;
  stats: Record<string, BuildingStats>;
}) {
  const isUnderConstruction = (building.constructionEnd ?? 0) > Date.now();
  const stat = stats[building.id] || {
    active: 0,
    working: 0,
    sleeping: 0,
    total: 0,
    assigned: 0,
  };
  const capacity = getBuildingCapacity(building.type);
  const icon = getBuildingIcon(building.type);
  const centerX = building.x + building.width / 2 - 0.5;
  const centerY = building.y + building.height / 2 - 0.5;

  return (
    <group>
      <BuildingMesh
        building={building}
        centerX={centerX}
        centerY={centerY}
        isUnderConstruction={isUnderConstruction}
      />
      {!isUnderConstruction && (
        <BuildingInfo
          building={building}
          capacity={capacity}
          centerX={centerX}
          centerY={centerY}
          icon={icon}
          stat={stat}
        />
      )}
      {building.captureStart && (
        <CaptureBar
          captureStart={building.captureStart}
          position={[centerX, building.y + building.height + 1.5, 3]}
          type={building.type}
        />
      )}
    </group>
  );
}

export function BuildingsRenderer({
  buildings,
  stats,
}: {
  buildings: Building[];
  stats: Record<string, BuildingStats>;
}) {
  return (
    <group>
      {buildings.map((b) => (
        <BuildingItem building={b} key={b.id} stats={stats} />
      ))}
    </group>
  );
}
