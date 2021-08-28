import { Point } from "realmlib";
import { Node, NodeUpdate, Heap, HashSet } from ".";

/**
 * A pathfinder which implements the A* pathfinding algorithm.
 */
export class Pathfinder {
    private nodes: Node[][];
    private mapSize: Point;

    constructor() {
        this.setMapSize(0, 0);
    }

    public setMapSize(width: number, height: number): void {
        this.mapSize = new Point(width, height);
        this.nodes = [...Array(this.mapSize.x)];
    }

    /**
     * Applies updates to the nodes known by this pathfinder.
     * @param updates The node updates to apply.
     */
    public updateWalkableNodes(updates: NodeUpdate[]): void {
        for (const update of updates) {
            this.nodes[update.x] ??= [...Array(this.mapSize.y)];

            const node = this.getNode(new Point(update.x, update.y));
            node.walkable = update.walkable;
            this.nodes[update.x][update.y] = node;
        }
    }

    /**
     * Finds a path from the `start` to the `end` and returns a list of points in between.
     * @param start The start point.
     * @param end The end point.
     */
    public findPath(start: Point, end: Point): Point[] {
        const startNode = this.getNode(start);
        const endNode = this.getNode(end);

        const openSet = new Heap<Node>(this.nodes.length);
        const closedSet = new HashSet<Node>();

        openSet.add(startNode);

        while (openSet.count > 0) {
            const currentNode = openSet.removeFirst();
            closedSet.add(currentNode);

            // Found path
            if (currentNode.pos.x === end.x && currentNode.pos.y === end.y) {
                return this.retracePath(currentNode);
            }

            const neighbors = this.getNeighbors(currentNode);
            for (const neighbor of neighbors) {
                if (closedSet.contains(neighbor)) continue;

                const moveCost = currentNode.gCost + this.getDistance(currentNode, neighbor);
                if (moveCost < neighbor.gCost || !openSet.contains(neighbor)) {
                    neighbor.gCost = moveCost;
                    neighbor.hCost = this.getDistance(neighbor, endNode);
                    neighbor.parent = currentNode;

                    if (!openSet.contains(neighbor)) {
                        openSet.add(neighbor);
                    }
                }
            }
        }
        return [];
    }

    private getNode(pos: Point): Node {
        // if the node is not present in this.nodes
        // then we assume the tile is walkable
        // for unloaded tiles, as well as this.nodes typically only containing unwalkable tiles.
        let node = this.nodes[pos.x]?.[pos.y];
        if (!node) {
            node = new Node(pos.x, pos.y);
        }
        return node;
    }

    private retracePath(node: Node): Point[] {
        const path: Point[] = [];
        let current = { ...node };
        while (current) {
            path.push(current.pos);
            current = current.parent;
        }

        return path.reverse();
    }

    private getNeighbors(node: Node): Node[] {
        const directions = [
            [0, 1], [1, 0], [0, -1], [-1, 0],   // N E S W
            [1, 1], [1, -1], [-1, -1], [-1, 1], // NE SE SW NW
        ];

        const neighbors: Node[] = [];
        for (const [x, y] of directions) {
            const pos = new Point(node.pos.x + x, node.pos.y + y);

            // bounds check
            if (pos.x < 0 || pos.x >= this.mapSize.x
                && pos.y < 0 || pos.y >= this.mapSize.y
            ) {
                continue;
            }

            const neighbor = this.getNode(pos);
            if (!neighbor.walkable) {
                continue;
            }

            neighbors.push(neighbor);
        }

        return neighbors;
    }

    private getDistance(nodeA: Node, nodeB: Node): number {
        const distX = Math.abs(nodeA.pos.x - nodeB.pos.x);
        const distY = Math.abs(nodeA.pos.y - nodeB.pos.y);

        if (distX > distY) {
            return 14 * distY + 10 * (distX - distY);
        }
        return 14 * distX + 10 * (distY - distX);
    }
}
