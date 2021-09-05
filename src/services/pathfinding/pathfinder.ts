import { Point } from "realmlib";
import { Node, NodeUpdate, Heap, HashSet, HeuristicFunction } from ".";

/**
 * A pathfinder which implements the A* pathfinding algorithm.
 */
export class Pathfinder {
    private nodes: Node[][];
    private mapSize: Point;
    private allowDiagonal = true;
    private readonly heuristic: HeuristicFunction;

    constructor(heuristic: HeuristicFunction) {
        this.setMapSize(0, 0);
        this.heuristic = heuristic;
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
            const node = new Node(update.x, update.y, update.walkable);
            this.nodes[update.x][update.y] = node;
        }
    }

    /**
     * Finds a path from the `start` to the `end` and returns a list of points in between.
     * @param start The start point, must be a floored coordinate on the tileMap
     * @param end The end point, must be a floored coordinate on the tileMap
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
            if (currentNode.pos.equalTo(end)) {
                return this.retracePath(currentNode);
            }

            const neighbors = this.getNeighbors(currentNode.pos);
            for (const neighbor of neighbors) {
                if (closedSet.contains(neighbor)) continue;

                const moveCost = currentNode.gCost + this.heuristic(currentNode, neighbor);
                if (moveCost < neighbor.gCost || !openSet.contains(neighbor)) {
                    neighbor.gCost = moveCost;
                    neighbor.hCost = this.heuristic(neighbor, endNode);
                    neighbor.parent = currentNode;

                    if (!openSet.contains(neighbor)) {
                        openSet.add(neighbor);
                    }
                }
            }
        }
        return [];
    }

    /**
     * @returns The node in our tile map, if it exists. Otherwise a new node is returned
     * and is assumed to be walkable.
     */
    private getNode(pos: Point): Node {
        let node = this.nodes[pos.x]?.[pos.y];
        if (!node) {
            node = new Node(pos.x, pos.y);
        }
        return node;
    }

    /**
     * If a path was found, this function will retrace the parent nodes of the currentNode
     * and will return a full path.
     */
    private retracePath(node: Node): Point[] {
        const path: Point[] = [];
        let current = { ...node };
        while (current) {
            path.push(current.pos);
            current = current.parent;
        }

        return path.reverse();
    }

    /**
     * @returns The neighbouring nodes (incl. diagonals) at a coordinate. Only includes
     * walkable nodes.
     */
    private getNeighbors(pos: Point): Node[] {
        const directions = [
            [0, 1], [1, 0], [0, -1], [-1, 0], // N E S W
        ];
        
        if (this.allowDiagonal) {
            directions.push([1, 1], [1, -1], [-1, -1], [-1, 1]); // NE SE SW NW
        }

        const neighbors: Node[] = [];
        for (const [x, y] of directions) {
            const newPos = new Point(pos.x + x, pos.y + y);

            // bounds check
            if (newPos.x < 0 || newPos.x >= this.mapSize.x
                && newPos.y < 0 || newPos.y >= this.mapSize.y
            ) {
                continue;
            }

            const neighbor = this.getNode(newPos);
            if (!neighbor.walkable) {
                continue;
            }

            neighbors.push(neighbor);
        }

        return neighbors;
    }
}