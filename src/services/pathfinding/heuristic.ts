import { Node } from ".";

export type HeuristicFunction = (a: Node, b: Node) => number;

export namespace Heuristic {

    // http://theory.stanford.edu/~amitp/GameProgramming/Heuristics.html#heuristics-for-grid-maps

    const D  = 1;             // minimum cost
    const D2 = Math.sqrt(2);  // diagonal cost

    export function euclidian(a: Node, b: Node): number {
        const [dx, dy] = diff(a, b);
        return D * Math.sqrt(dx * dx + dy * dy);
    }

    export function diagonal(a: Node, b: Node): number {
        const [dx, dy] = diff(a, b);
        return D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
    }

    export function manhattan(a: Node, b: Node): number {
        const [dx, dy] = diff(a, b);
        return D * (dx + dy);
    }
}

function diff(a: Node, b: Node): [number, number] {
    const dx = Math.abs(a.pos.x - b.pos.x);
    const dy = Math.abs(a.pos.y - b.pos.y);
    return [dx, dy];
}
