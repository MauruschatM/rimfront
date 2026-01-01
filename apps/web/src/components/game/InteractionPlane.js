import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useRef, useState } from "react";
export function InteractionPlane({ game, width, height, onClick, isBuildMode, selectedBuilding, selectedTroopId, onMoveTroop, isDraggingRef, staticMap, buildings, energyTiles, }) {
    const { camera, raycaster } = useThree();
    const [hoverPos, setHoverPos] = useState(null);
    const planeRef = useRef(null);
    useFrame((state) => {
        const isDefenseMode = !!selectedTroopId;
        const isActive = game.phase === "placement" ||
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
    const handleClick = useCallback((e) => {
        e.stopPropagation();
        if (isDraggingRef?.current)
            return;
        if (hoverPos) {
            if (selectedTroopId && onMoveTroop) {
                onMoveTroop(hoverPos.x, hoverPos.y);
            }
            else {
                onClick(hoverPos.x, hoverPos.y);
            }
        }
    }, [hoverPos, selectedTroopId, onMoveTroop, onClick, isDraggingRef]);
    let cursorColor = "white";
    let cursorWidth = 1;
    let cursorHeight = 1;
    if (game.phase === "placement") {
        cursorWidth = 5;
        cursorHeight = 5;
        cursorColor = "lime";
        if (hoverPos && staticMap) {
            let isBlocked = false;
            if (hoverPos.x < 0 ||
                hoverPos.y < 0 ||
                hoverPos.x + 5 > width ||
                hoverPos.y + 5 > height) {
                isBlocked = true;
            }
            if (!isBlocked) {
                const structures = staticMap.structures;
                for (const b of buildings) {
                    if (hoverPos.x < b.x + b.width &&
                        hoverPos.x + 5 > b.x &&
                        hoverPos.y < b.y + b.height &&
                        hoverPos.y + 5 > b.y) {
                        isBlocked = true;
                        break;
                    }
                }
                if (!isBlocked && structures) {
                    for (const s of structures) {
                        if (hoverPos.x < s.x + s.width &&
                            hoverPos.x + 5 > s.x &&
                            hoverPos.y < s.y + s.height &&
                            hoverPos.y + 5 > s.y) {
                            isBlocked = true;
                            break;
                        }
                    }
                }
            }
            if (isBlocked)
                cursorColor = "red";
        }
    }
    else if (isBuildMode && selectedBuilding) {
        cursorColor = "lime";
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
            case "wall": {
                cursorWidth = 1;
                cursorHeight = 1;
                break;
            }
            case "turret": {
                cursorWidth = 2;
                cursorHeight = 2;
                break;
            }
            default: {
                break;
            }
        }
        if (hoverPos) {
            let isValid = true;
            if (hoverPos.x < 0 ||
                hoverPos.y < 0 ||
                hoverPos.x + cursorWidth > width ||
                hoverPos.y + cursorHeight > height) {
                isValid = false;
            }
            if (isValid) {
                for (const b of buildings) {
                    const noOverlap = hoverPos.x >= b.x + b.width + 1 ||
                        hoverPos.x + cursorWidth + 1 <= b.x ||
                        hoverPos.y >= b.y + b.height + 1 ||
                        hoverPos.y + cursorHeight + 1 <= b.y;
                    if (!noOverlap) {
                        isValid = false;
                        break;
                    }
                }
                if (isValid && staticMap?.structures) {
                    const structures = staticMap.structures;
                    for (const s of structures) {
                        const noOverlap = hoverPos.x >= s.x + s.width ||
                            hoverPos.x + cursorWidth <= s.x ||
                            hoverPos.y >= s.y + s.height ||
                            hoverPos.y + cursorHeight <= s.y;
                        if (!noOverlap) {
                            isValid = false;
                            break;
                        }
                    }
                }
            }
            if (isValid && !energyTiles.has("ALL")) {
                const cx = hoverPos.x + cursorWidth / 2;
                const cy = hoverPos.y + cursorHeight / 2;
                const centerKey = `${Math.floor(cx)},${Math.floor(cy)}`;
                if (!energyTiles.has(centerKey)) {
                    isValid = false;
                }
            }
            if (!isValid) {
                cursorColor = "red";
            }
        }
    }
    else if (selectedTroopId) {
        cursorColor = "red";
    }
    return (<group>
      <mesh onClick={handleClick} position={[width / 2, height / 2, 0]} ref={planeRef} visible={false}>
        <planeGeometry args={[width, height]}/>
      </mesh>

      {hoverPos && (<mesh position={[
                hoverPos.x + cursorWidth / 2 - 0.5,
                hoverPos.y + cursorHeight / 2 - 0.5,
                0.1,
            ]}>
          <boxGeometry args={[cursorWidth, cursorHeight, 0.5]}/>
          <meshBasicMaterial color={cursorColor} opacity={0.5} transparent wireframe/>
        </mesh>)}
    </group>);
}
