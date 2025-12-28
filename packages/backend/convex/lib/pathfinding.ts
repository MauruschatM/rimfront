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

class MinHeap {
  heap: Node[];

  constructor() {
    this.heap = [];
  }

  push(node: Node) {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): Node | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const bottom = this.heap.pop();
    if (this.heap.length > 0 && bottom) {
      this.heap[0] = bottom;
      this.sinkDown(0);
    }
    return top;
  }

  size(): number {
    return this.heap.length;
  }

  private bubbleUp(index: number) {
    const node = this.heap[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.heap[parentIndex];
      if (node.f >= parent.f) break;
      this.heap[parentIndex] = node;
      this.heap[index] = parent;
      index = parentIndex;
    }
    this.heap[index] = node;
  }

  private sinkDown(index: number) {
    const length = this.heap.length;
    const node = this.heap[index];
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let swap = -1;

      if (leftChildIndex < length) {
        const leftChild = this.heap[leftChildIndex];
        if (leftChild.f < node.f) {
          swap = leftChildIndex;
        }
      }

      if (rightChildIndex < length) {
        const rightChild = this.heap[rightChildIndex];
        if (
          (swap === -1 && rightChild.f < node.f) ||
          (swap !== -1 && rightChild.f < this.heap[swap].f)
        ) {
          swap = rightChildIndex;
        }
      }

      if (swap === -1) break;
      this.heap[index] = this.heap[swap];
      this.heap[swap] = node;
      index = swap;
    }
  }
}

/**
 * Creates a collision map from map dimensions, tiles (optional terrain cost), and buildings.
 * Returns a set of "blocked" strings "x,y" for O(1) lookup.
 */
export function createCollisionMap(
  width: number,
  height: number,
  buildings: any[],
  tiles?: number[]
): Set<string> {
  const blocked = new Set<string>();

  // Block Buildings
  for (const b of buildings) {
    for (let bx = 0; bx < b.width; bx++) {
      for (let by = 0; by < b.height; by++) {
        blocked.add(`${b.x + bx},${b.y + by}`);
      }
    }
  }

  // Block Terrain (optional)
  return blocked;
}

/**
 * Finds the nearest walkable tile to the target using BFS.
 */
function findNearestWalkable(
  target: Point,
  width: number,
  height: number,
  blocked: Set<string>
): Point | null {
  // If target is not blocked, return it directly
  if (!blocked.has(`${target.x},${target.y}`)) {
    return target;
  }

  const queue: Point[] = [target];
  const visited = new Set<string>();
  visited.add(`${target.x},${target.y}`);

  // Limit search to a small radius (e.g., 6 tiles) to find an entrance/edge
  const MAX_SEARCH_STEPS = 100;
  let steps = 0;

  while (queue.length > 0 && steps < MAX_SEARCH_STEPS) {
    const curr = queue.shift()!;
    steps++;

    if (!blocked.has(`${curr.x},${curr.y}`)) {
      return curr;
    }

    const neighbors = [
      { x: curr.x + 1, y: curr.y },
      { x: curr.x - 1, y: curr.y },
      { x: curr.x, y: curr.y + 1 },
      { x: curr.x, y: curr.y - 1 },
    ];

    for (const n of neighbors) {
      if (n.x >= 0 && n.x < width && n.y >= 0 && n.y < height) {
        const key = `${n.x},${n.y}`;
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(n);
        }
      }
    }
  }

  return null;
}

/**
 * Finds a path using A* with MinHeap and iteration limits.
 * @param start Start Point
 * @param end End Point
 * @param width Map Width
 * @param height Map Height
 * @param blocked Set of blocked "x,y" strings
 * @returns Array of Points (including start and end) or null if no path
 */
export function findPath(
  start: Point,
  end: Point,
  width: number,
  height: number,
  blocked: Set<string>
): Point[] | null {
  // 1. Resolve effective target (handle blocked end)
  const realEnd = findNearestWalkable(end, width, height, blocked);
  if (!realEnd) {
    // Could not find any walkable tile near target
    return null;
  }

  const openList = new MinHeap();
  const closedSet = new Set<string>();

  // Use a Map to track G scores to avoid searching the heap
  const gScoreMap = new Map<string, number>();

  const startNode: Node = {
    x: start.x,
    y: start.y,
    f: 0,
    g: 0,
    h: 0,
    parent: null,
  };

  const startKey = `${start.x},${start.y}`;
  gScoreMap.set(startKey, 0);
  openList.push(startNode);

  const endKey = `${realEnd.x},${realEnd.y}`;

  // Limit iterations to prevent server freeze
  let iterations = 0;
  const MAX_ITERATIONS = 3000;

  while (openList.size() > 0) {
    iterations++;
    if (iterations > MAX_ITERATIONS) {
      // Path too complex or unreachable
      return null;
    }

    const currentNode = openList.pop()!;
    const currentKey = `${currentNode.x},${currentNode.y}`;

    if (currentNode.x === realEnd.x && currentNode.y === realEnd.y) {
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
      if (
        neighbor.x < 0 ||
        neighbor.x >= width ||
        neighbor.y < 0 ||
        neighbor.y >= height
      )
        continue;

      // Collision check
      // Note: We already adjusted realEnd to be walkable, so we strictly check blocked
      if (blocked.has(neighborKey)) continue;

      if (closedSet.has(neighborKey)) continue;

      const tentativeG = currentNode.g + 1;
      const existingG = gScoreMap.get(neighborKey);

      if (existingG !== undefined && tentativeG >= existingG) {
        continue;
      }

      // Found a better path or new node
      gScoreMap.set(neighborKey, tentativeG);

      const hScore =
        Math.abs(neighbor.x - realEnd.x) + Math.abs(neighbor.y - realEnd.y); // Manhattan

      const newNode: Node = {
        x: neighbor.x,
        y: neighbor.y,
        f: tentativeG + hScore,
        g: tentativeG,
        h: hScore,
        parent: currentNode,
      };

      openList.push(newNode);
    }
  }

  return null; // No path found
}
