import { Point } from "realmlib";
import { Tile, Node, MapPlugin } from "../..";

export class NodeMap<T = Tile> {

    public width: number;
    public height: number;

    public node: T[][];

    constructor() {
        this.width = 0;
        this.height = 0;
        this.node = [];
    }

    public getNodeAt(pos: Point): T | null {
        const x = Math.floor(pos.x);
        const y = Math.floor(pos.y);
        const tile = this.node[x]?.[y];
        return tile;
    }

    /**
     * @param diagonals Whether to include the diagonal tiles around the point.
     * @returns The neighbouring nodes around a point.
     */
    public getNeighbors(pos: Point, diagonals = false): T[] {
        const directions = [
            [0, 1], [1, 0], [0, -1], [-1, 0], // N E S W
        ];

        if (diagonals) {
            directions.push([1, 1], [1, -1], [-1, -1], [-1, 1]); // NE SE SW NW
        }

        const neighbors: T[] = [];
        for (const [x, y] of directions) {
            const newPos = new Point(pos.x + x, pos.y + y);
            const node = this.getNodeAt(newPos);
            if (!node) continue;
            neighbors.push(node);
        }

        return neighbors;
    }
}