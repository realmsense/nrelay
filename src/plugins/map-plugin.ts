import { GameId, MapInfoPacket, Point, UpdatePacket } from "realmlib";
import { Client, TileXML, MapObject, Logger, LogLevel } from "..";
import { PacketHook, Plugin } from "../decorators";

@Plugin({
    name: "Map Plugin",
    author: "Extacy",
    instantiate: false
})
export class MapPlugin {

    private client: Client;

    public mapInfo: MapInfoPacket;
    public key: number[];
    public keyTime: number;
    public gameId: GameId;

    public tileMap: TileXML[][];
    public portals: MapObject[];

    constructor(client: Client) {
        this.client = client;
        this.key = [];
        this.keyTime = -1;
        this.gameId = GameId.Nexus;
        this.tileMap = [];
        this.portals = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
    }

    public getTile(pos: Point): TileXML | null {
        const tile = this.tileMap[Math.floor(pos.x)]?.[Math.floor(pos.y)];
        return tile;
    }

    @PacketHook()
    public onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.mapInfo = mapInfoPacket;
    }

    @PacketHook()
    public onUpdate(updatePacket: UpdatePacket): void {

        // tiles
        for (const tile of updatePacket.tiles) {
            const tileXML = this.client.runtime.resources.tiles[tile.type];
            if (!tileXML) {
                Logger.log("Map", `Could not find Tile with type ${tile.type}`, LogLevel.Warning);
                continue;
            }

            this.tileMap[tile.x] ??= [];
            this.tileMap[tile.x][tile.y] = tileXML;
        }

        // new objects
        for (const newObject of updatePacket.newObjects) {

            // portals
            const portalXML = this.client.runtime.resources.portals[newObject.objectType];
            if (portalXML) {
                const object: MapObject = {
                    ...portalXML,
                    objectId: newObject.status.objectId,
                    pos: newObject.status.pos,
                    name: portalXML.dungeonName || portalXML.displayId || portalXML.id
                };
                this.portals.push(object);
            }
        }
    }
}