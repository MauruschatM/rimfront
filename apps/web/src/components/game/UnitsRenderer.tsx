import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useInterpolatedUnits } from "./GameHooks";

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
  troopId?: string;
  homeId?: string;
  stateEnd?: number;
  path?: { x: number; y: number }[];
  pathIndex?: number;
  targetWorkshopId?: string;
  targetHomeId?: string;
  workplaceId?: string;
  // Combat
  lastAttackTime?: number;
  health?: number;
  attackTargetId?: string;
  attackEndTime?: number;
}

export function LasersRenderer({
  entityMap,
  attackingUnits,
}: {
  entityMap: Map<string, Entity>;
  attackingUnits: Entity[];
}) {
  const lasers = useMemo(() => {
    return attackingUnits
      .map((unit) => {
        const target = entityMap.get(unit.attackTargetId!);
        if (!target) return null;

        const jitterX = (Math.random() - 0.5) * 0.5;
        const jitterY = (Math.random() - 0.5) * 0.5;

        return {
          id: unit._id,
          start: [unit.x, unit.y, 1] as [number, number, number],
          end: [target.x + jitterX, target.y + jitterY, 1] as [
            number,
            number,
            number,
          ],
        };
      })
      .filter(
        (
          l
        ): l is {
          id: string;
          start: [number, number, number];
          end: [number, number, number];
        } => !!l
      );
  }, [attackingUnits, entityMap]);

  return (
    <group>
      {lasers.map((l) => (
        <Line
          color="blue"
          key={l.id}
          lineWidth={2}
          opacity={0.8}
          points={[l.start, l.end]}
          transparent
        />
      ))}
    </group>
  );
}

export function UnitsRenderer({
  entities,
  entityMap,
  families,
  commanders,
  soldiers,
  turretGuns,
  selectedTroopId,
  onSelectTroop,
  isDraggingRef,
}: {
  entities: Entity[];
  entityMap?: Map<string, Entity>;
  families: Entity[];
  commanders: Entity[];
  soldiers: Entity[];
  turretGuns: Entity[];
  selectedTroopId?: string | null;
  onSelectTroop?: (id: string | null) => void;
  isDraggingRef?: React.MutableRefObject<boolean>;
}) {
  const familiesRef = useRef<THREE.InstancedMesh>(null);
  const commandersRef = useRef<THREE.InstancedMesh>(null);
  const soldiersRef = useRef<THREE.InstancedMesh>(null);
  const turretGunsRef = useRef<THREE.InstancedMesh>(null);

  const interpolation = useInterpolatedUnits(entities, entityMap);
  const tempObj = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const updateMesh = (mesh: THREE.InstancedMesh | null, list: Entity[]) => {
      if (!mesh) return;
      list.forEach((entity, i) => {
        const pos =
          entity.type === "turret_gun"
            ? { x: entity.x, y: entity.y }
            : interpolation.getInterpolatedPosition(
                entity._id,
                entity.x,
                entity.y
              );

        let z = entity.type === "commander" ? 1 : 0.5;
        if (entity.type === "turret_gun") z = 1.0;

        if (
          (entity.state === "moving" ||
            entity.state === "patrol" ||
            entity.path) &&
          entity.type !== "turret_gun"
        ) {
          z += Math.abs(Math.sin(state.clock.elapsedTime * 10)) * 0.2;
        }

        if (entity.type === "turret_gun" && entity.attackTargetId) {
          const target = entityMap
            ? entityMap.get(entity.attackTargetId)
            : entities.find((e) => e._id === entity.attackTargetId);

          if (target) {
            const tPos = interpolation.getInterpolatedPosition(
              target._id,
              target.x,
              target.y
            );
            const angle = Math.atan2(tPos.y - pos.y, tPos.x - pos.x);
            tempObj.rotation.z = angle;
          }
        } else {
          tempObj.rotation.z = 0;
        }

        const scale =
          entity.type === "commander"
            ? 0.8
            : entity.type === "soldier"
              ? 0.4
              : entity.type === "turret_gun"
                ? 1.0
                : 0.5;

        tempObj.position.set(pos.x, pos.y, z);
        tempObj.scale.set(scale, scale, scale);
        tempObj.updateMatrix();
        mesh.setMatrixAt(i, tempObj.matrix);

        // Reset transform for next iteration to prevent state bleeding
        tempObj.position.set(0, 0, 0);
        tempObj.rotation.set(0, 0, 0);
        tempObj.scale.set(1, 1, 1);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };

    updateMesh(familiesRef.current, families);
    updateMesh(commandersRef.current, commanders);
    updateMesh(soldiersRef.current, soldiers);
    updateMesh(turretGunsRef.current, turretGuns);
  });

  const handleUnitClick = useCallback(
    (
      e: { stopPropagation: () => void; instanceId?: number },
      list: Entity[]
    ) => {
      if (isDraggingRef?.current) return;
      if (!onSelectTroop) {
        return;
      }
      e.stopPropagation();
      const instanceId = e.instanceId;
      if (instanceId !== undefined && list[instanceId]) {
        const unit = list[instanceId];
        if (unit.troopId) {
          onSelectTroop(unit.troopId);
        }
      }
    },
    [onSelectTroop, isDraggingRef]
  );

  useEffect(() => {
    const mesh = familiesRef.current;
    if (mesh) {
      const color = new THREE.Color();
      families.forEach((r, i) => {
        if (r.state === "working") {
          color.set("lime");
        } else if (r.state === "sleeping") {
          color.set("blue");
        } else {
          color.set("white");
        }
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [families]);

  useEffect(() => {
    const mesh = commandersRef.current;
    if (mesh) {
      const color = new THREE.Color();
      commanders.forEach((c, i) => {
        if (selectedTroopId && c.troopId === selectedTroopId) {
          color.set("yellow");
        } else {
          color.set("red");
        }
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [commanders, selectedTroopId]);

  useEffect(() => {
    const mesh = soldiersRef.current;
    if (mesh) {
      const color = new THREE.Color();
      soldiers.forEach((s, i) => {
        if (selectedTroopId && s.troopId === selectedTroopId) {
          color.set("orange");
        } else {
          color.set("maroon");
        }
        mesh.setColorAt(i, color);
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [soldiers, selectedTroopId]);

  return (
    <group>
      {families.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, families.length]}
          ref={familiesRef}
        >
          <sphereGeometry args={[0.4, 8, 8]} />
          <meshBasicMaterial />
        </instancedMesh>
      )}
      {commanders.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, commanders.length]}
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
      {turretGuns.length > 0 && (
        <instancedMesh
          args={[undefined, undefined, turretGuns.length]}
          ref={turretGunsRef}
        >
          <boxGeometry args={[1.5, 0.4, 0.4]} />
          <meshStandardMaterial color="#ef4444" />
        </instancedMesh>
      )}
    </group>
  );
}
