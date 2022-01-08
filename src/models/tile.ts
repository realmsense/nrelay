import { TileXML } from ".";
import { Point } from "..";

export class Tile extends Point {

    declare public x: number;
    declare public y: number;

    public xml?: TileXML;

    public occupied = false;
    public get walkable(): boolean {
        if (this.occupied) return false;
        if (!this.xml) return true;         // Unloaded tiles are assumed to be walkable, until proven false in UpdatePacket (see MapPlugin)
        return Tile.IsWalkable(this.xml);
    }

    constructor(x: number, y: number, xml?: TileXML) {
        super(x, y);
        this.xml = xml;
    }

    public static IsWalkable(xml: TileXML): boolean {
        return !xml.noWalk && xml.minDamage <= 0 && xml.maxDamage <= 0;
    }

    public get pos(): Point {
        return new Point(this.x, this.y);
    }
}