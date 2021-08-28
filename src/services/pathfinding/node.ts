import { Point } from "realmlib";
import { HeapItem, Hashable } from ".";

/**
 * A pathfinder node for the A* pathfinding algorithm.
 */
export class Node implements HeapItem<Node>, Hashable {
    /**
     * The parent node.
     */
    public parent: Node = null;
    /**
     * The cost of getting from the start node to this node.
     */
    public gCost = 0;
    /**
     * The cost of getting from this node to the end node.
     */
    public hCost = 0;

    public pos: Point;
    /**
     * Whether or not this node can be walked on.
     */
    public walkable = true;
    public heapIndex = -1;
    /**
     * The combined `gCost` and `hCost`.
     */
    public get fCost(): number {
        return this.gCost + this.hCost;
    }

    constructor(x: number, y: number) {
        this.pos = new Point(x, y);
    }

    public hash(): string {
        return this.pos.x + "" + this.pos.y;
    }

    public compareTo(item: Node): number {
        if (this.fCost > item.fCost) {
            return -1;
        }
        if (this.fCost === item.fCost) {
            if (this.hCost > item.hCost) {
                return -1;
            }
            if (this.hCost < item.hCost) {
                return 1;
            }
            return 0;
        }
        return 1;
    }
}
