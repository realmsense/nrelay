import Heap from "heap";
import { Point } from "realmlib";
import { Node, HeuristicFunction, NodeMap } from ".";

export class AStar {

    constructor(
        private heuristic: HeuristicFunction,
        private diagonalMovement: boolean
    ) {
    }

    public findPath(startPoint: Point, endPoint: Point, nodeMap: NodeMap<Node>): Point[] {

        const cmp = (a: Node, b: Node): number => { return a.fCost - b.fCost; }; // Compare function for the lowest f cost
        const openList = new Heap<Node>(cmp);

        const startNode = nodeMap.getNodeAt(startPoint);
        const endNode = nodeMap.getNodeAt(endPoint);
        if (!startNode || !endNode) {
            return [];
        }

        openList.push(startNode);
        startNode.opened = true;

        while (!openList.empty()) {
            const currentNode = openList.pop();
            currentNode.closed = true;

            // Found path
            if (currentNode == endNode) {
                return this.retracePath(currentNode);
            }

            const neighbors = nodeMap.getNeighbors(currentNode.pos, this.diagonalMovement);
            for (const neighbor of neighbors) {
                if (neighbor.closed || !neighbor.walkable) {
                    continue;
                }

                // Calculate the cost for this move. This is simply "1" for non-diagonal movement, or Sqrt(2) for diagonal movement (due to pythag)
                const moveCost = neighbor.gCost + (neighbor.isDiagonal(currentNode) ? 1 : Math.SQRT2);

                // TODO: speedy tiles less cost

                if (moveCost < neighbor.gCost || !neighbor.opened) {
                    neighbor.gCost = moveCost;
                    neighbor.hCost = this.heuristic(neighbor, endNode);
                    neighbor.parent = currentNode;

                    if (!neighbor.opened) {
                        openList.push(neighbor);
                        neighbor.opened = true;
                    } else {
                        // neighbor can be reached with a smaller cost, update position in the heap
                        openList.updateItem(neighbor);   
                    }
                }
            }
        }

        // No path found
        return [];
    }

    private retracePath(node: Node): Point[] {
        const path: Point[] = [];
        let current = node;
        while (current) {
            path.push(current.pos);
            current = current.parent;
        }
        return path.reverse();
    }
}
