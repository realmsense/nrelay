import { GameId, MapInfoPacket, UpdatePacket } from "realmlib";
import { Client, TileXML, MapObject, Logger, LogLevel } from "..";
import { PacketHook } from "../decorators";

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

    @PacketHook()
    public onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.mapInfo = mapInfoPacket;
    }

    @PacketHook()
    public onUpdate(updatePacket: UpdatePacket): void {

        // tiles
        for (const newTile of updatePacket.tiles) {
            const tile = this.client.runtime.resources.tiles[newTile.type];
            if (!tile) {
                Logger.log("Map", `Could not find Tile with type ${newTile.type}`, LogLevel.Warning);
                continue;
            }
            
            this.tileMap[newTile.x] ??= [];
            this.tileMap[newTile.x][newTile.y] = tile;
        }

        // new objects (portals)
        for (const newObject of updatePacket.newObjects) {
            const portalXML = this.client.runtime.resources.portals[newObject.objectType];
            if (!portalXML) continue;

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