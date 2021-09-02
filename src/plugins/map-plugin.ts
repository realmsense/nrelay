import TypedEmitter from "typed-emitter";
import { EventEmitter } from "events";
import { GameId, MapInfoPacket, Point, UpdatePacket } from "realmlib";
import { Client, TileXML, Logger, LogLevel, Portal } from "..";
import { PacketHook, Plugin } from "../decorators";

@Plugin({
    name: "Map Plugin",
    author: "Extacy",
    instantiate: false
})
export class MapPlugin {

    private client: Client;
    public emitter: TypedEmitter<MapEvents>;

    public mapInfo: MapInfoPacket;
    public key: number[];
    public keyTime: number;
    public gameId: GameId;

    public tileMap: TileXML[][];
    public portals: Portal[];

    constructor(client: Client) {
        this.client = client;
        this.emitter = new EventEmitter();
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

        for (const newObject of updatePacket.newObjects) {
            // portals
            const portalXML = this.client.runtime.resources.portals[newObject.objectType];
            if (portalXML) {
                const portal = new Portal();
                portal.xml = portalXML;
                portal.parseStatus(newObject.status);
                this.portals.push(portal);
                this.emitter.emit("newPortal", portal);
            }
        }

        for (const objectId of updatePacket.drops) {
            const portalIndex = this.portals.findIndex((value) => value.objectID == objectId);
            if (portalIndex != -1) {
                this.emitter.emit("removedPortal", this.portals[portalIndex]);
                this.portals.slice(portalIndex, 1);
                continue;
            }
        }
    }
}

interface MapEvents {
    newPortal: (portal: Portal) => void,
    removedPortal: (portal: Portal) => void,
}
