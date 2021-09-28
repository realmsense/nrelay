import { Point } from "realmlib";
import { HeapItem, Hashable } from ".";

/**
 * A pathfinder node for the A* pathfinding algorithm.
 */
export class Node implements HeapItem<Node>, Hashable {

    public parent: Node;
    public heapIndex = -1;

    public gCost = 0;
    public hCost = 0;
    public get fCost(): number {
        return this.gCost + this.hCost;
    }

    public pos: Point;
    public walkable: boolean;

    constructor(x: number, y: number, walkable = true) {
        this.pos = new Point(x, y);
        this.walkable = walkable;
    }

    public hash(): string {
        return this.pos.x + "" + this.pos.y;
    }

    public compareTo(node: Node): number {
        if (this.fCost > node.fCost) {
            return -1;
        }

        if (this.fCost < node.fCost) {
            return 1;
        }

        return 0;
    }
}
