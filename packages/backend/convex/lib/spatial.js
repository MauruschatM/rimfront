export class SpatialHash {
    grid;
    cellSize;
    constructor(cellSize) {
        this.cellSize = cellSize;
        this.grid = new Map();
    }
    _key(x, y) {
        return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`;
    }
    insert(type, id, x, y, ownerId) {
        const key = this._key(x, y);
        if (!this.grid.has(key)) {
            this.grid.set(key, []);
        }
        this.grid.get(key)?.push({ type, id, x, y, ownerId });
    }
    query(x, y, radius) {
        const results = [];
        const minX = Math.floor((x - radius) / this.cellSize);
        const maxX = Math.floor((x + radius) / this.cellSize);
        const minY = Math.floor((y - radius) / this.cellSize);
        const maxY = Math.floor((y + radius) / this.cellSize);
        for (let cx = minX; cx <= maxX; cx++) {
            for (let cy = minY; cy <= maxY; cy++) {
                const key = `${cx},${cy}`;
                const items = this.grid.get(key);
                if (items) {
                    for (const item of items) {
                        const dx = item.x - x;
                        const dy = item.y - y;
                        if (dx * dx + dy * dy <= radius * radius) {
                            results.push(item);
                        }
                    }
                }
            }
        }
        return results;
    }
}
