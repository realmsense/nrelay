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
    /**
     * The X coordinate of this node.
     */
    public x = 0;
    /**
     * The Y coordinate of this node.
     */
    public y = 0;
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
        this.x = x;
        this.y = y;
    }

    public hash(): string {
        return this.x + "" + this.y;
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
