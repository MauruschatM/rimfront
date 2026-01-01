import { useEffect, useRef } from "react";
export function useInterpolatedUnits(entities = []) {
    const prevEntitiesRef = useRef({});
    const interpolatedRef = useRef({});
    useEffect(() => {
        const now = Date.now();
        entities.forEach((e) => {
            const currentPos = interpolatedRef.current[e._id] || { x: e.x, y: e.y };
            prevEntitiesRef.current[e._id] = {
                x: currentPos.x,
                y: currentPos.y,
                time: now,
            };
            if (!interpolatedRef.current[e._id]) {
                interpolatedRef.current[e._id] = { x: e.x, y: e.y };
            }
        });
        const currentIds = new Set(entities.map((e) => e._id));
        for (const id in prevEntitiesRef.current) {
            if (!currentIds.has(id)) {
                delete prevEntitiesRef.current[id];
                delete interpolatedRef.current[id];
            }
        }
    }, [entities]);
    return {
        getInterpolatedPosition: (id, targetX, targetY) => {
            const start = prevEntitiesRef.current[id];
            if (!start)
                return { x: targetX, y: targetY };
            const now = Date.now();
            const elapsed = now - start.time;
            const duration = 100;
            const t = Math.min(elapsed / duration, 1);
            const alpha = t * (2 - t);
            const x = start.x + (targetX - start.x) * alpha;
            const y = start.y + (targetY - start.y) * alpha;
            interpolatedRef.current[id] = { x, y };
            return { x, y };
        },
    };
}
export function getEnergyTiles(buildings, playerId, width, height) {
    const validTiles = new Set();
    const myBuildings = buildings.filter((b) => b.ownerId === playerId);
    if (myBuildings.length === 0) {
        return new Set(["ALL"]);
    }
    for (const b of myBuildings) {
        const radius = Math.max(b.width, b.height) / 2 + 4;
        const centerX = b.x + b.width / 2;
        const centerY = b.y + b.height / 2;
        const minX = Math.floor(Math.max(0, centerX - radius - 2));
        const maxX = Math.ceil(Math.min(width, centerX + radius + 2));
        const minY = Math.floor(Math.max(0, centerY - radius - 2));
        const maxY = Math.ceil(Math.min(height, centerY + radius + 2));
        for (let x = minX; x < maxX; x++) {
            for (let y = minY; y < maxY; y++) {
                const dist = Math.sqrt((x + 0.5 - centerX) ** 2 + (y + 0.5 - centerY) ** 2);
                const bRadius = Math.max(b.width, b.height) / 2;
                if (dist <= bRadius + 4) {
                    validTiles.add(`${x},${y}`);
                }
            }
        }
    }
    return validTiles;
}
