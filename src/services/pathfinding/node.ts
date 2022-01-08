import { Tile, TileXML } from "../..";

export class Node extends Tile {
    public parent: Node;

    public opened: boolean;
    public closed: boolean;

    public gCost: number;
    public hCost: number;
    public get fCost(): number {
        return this.gCost + this.hCost;
    }

    constructor(x: number, y: number, xml?: TileXML) {
        super(x, y, xml);

        this.opened = false;
        this.closed = false;
        
        this.gCost = 0;
        this.hCost = 0;
    }

    public static fromTile(tile: Tile): Node {
        return new this(tile.x, tile.y, tile.xml);
    }
}