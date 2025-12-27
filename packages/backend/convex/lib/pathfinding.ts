// A* Pathfinding Implementation for Grid

interface Point {
    x: number;
    y: number;
}

// Node for A*
interface Node {
    x: number;
    y: number;
    f: number; // Total cost
    g: number; // Cost from start
    h: number; // Heuristic to end
    parent: Node | null;
}

/**
 * Creates a collision map from map dimensions, tiles (optional terrain cost), and buildings.
 * Returns a set of "blocked" strings "x,y" for O(1) lookup.
 */
export function createCollisionMap(width: number, height: number, buildings: any[], tiles?: number[]): Set<string> {
    const blocked = new Set<string>();

    // Block Buildings
    for (const b of buildings) {
        for (let bx = 0; bx < b.width; bx++) {
            for (let by = 0; by < b.height; by++) {
                blocked.add(`${b.x + bx},${b.y + by}`);
            }
        }
    }

    // Block Terrain (optional, e.g., Water/Lava if tile IDs are known)
    // Assuming simple walkable for now or just buildings block.
    // If tiles are provided, could block specific IDs (e.g., Lava=7, Water=?)
    // For now, only buildings block movement.

    return blocked;
}

/**
 * Finds a path using A*
 * @param start Start Point
 * @param end End Point
 * @param width Map Width
 * @param height Map Height
 * @param blocked Set of blocked "x,y" strings
 * @returns Array of Points (including start and end) or null if no path
 */
export function findPath(start: Point, end: Point, width: number, height: number, blocked: Set<string>): Point[] | null {
    // If start or end is blocked, return null (or handle nearest valid)
    // For this game, if target is a building, the "target tile" is likely occupied by the building itself.
    // We should path to an *adjacent* tile of the building, not inside it.
    // But residents usually "enter" the building.
    // So we treat the END tile as walkable even if in `blocked`.

    const openList: Node[] = [];
    const closedSet = new Set<string>();

    const startNode: Node = { x: start.x, y: start.y, f: 0, g: 0, h: 0, parent: null };
    openList.push(startNode);

    const endKey = `${end.x},${end.y}`;

    while (openList.length > 0) {
        // Sort by F (lowest first) - Optimization: MinHeap is better but array sort is okay for short paths
        openList.sort((a, b) => a.f - b.f);
        const currentNode = openList.shift()!;
        const currentKey = `${currentNode.x},${currentNode.y}`;

        if (currentNode.x === end.x && currentNode.y === end.y) {
            // Reconstruct path
            const path: Point[] = [];
            let curr: Node | null = currentNode;
            while (curr) {
                path.push({ x: curr.x, y: curr.y });
                curr = curr.parent;
            }
            return path.reverse();
        }

        closedSet.add(currentKey);

        const neighbors = [
            { x: currentNode.x + 1, y: currentNode.y },
            { x: currentNode.x - 1, y: currentNode.y },
            { x: currentNode.x, y: currentNode.y + 1 },
            { x: currentNode.x, y: currentNode.y - 1 },
        ];

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;

            // Bounds check
            if (neighbor.x < 0 || neighbor.x >= width || neighbor.y < 0 || neighbor.y >= height) continue;

            // Collision check (Ignore collision if it's the target tile - e.g. entering a door)
            if (blocked.has(neighborKey) && neighborKey !== endKey) continue;

            if (closedSet.has(neighborKey)) continue;

            const gScore = currentNode.g + 1;

            // Check if already in open list with better G
            const existingNode = openList.find(n => n.x === neighbor.x && n.y === neighbor.y);
            if (existingNode && gScore >= existingNode.g) continue;

            const hScore = Math.abs(neighbor.x - end.x) + Math.abs(neighbor.y - end.y); // Manhattan
            const newNode: Node = {
                x: neighbor.x,
                y: neighbor.y,
                f: gScore + hScore,
                g: gScore,
                h: hScore,
                parent: currentNode
            };

            if (existingNode) {
                // Update existing
                existingNode.g = gScore;
                existingNode.f = gScore + hScore;
                existingNode.parent = currentNode;
            } else {
                openList.push(newNode);
            }
        }
    }

    return null; // No path found
}
