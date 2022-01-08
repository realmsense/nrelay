import TypedEmitter from "typed-emitter";
import { EventEmitter } from "events";
import { GameId, MapInfoPacket, NewTickPacket, UpdatePacket } from "realmlib";
import { Client, Logger, LogLevel, Portal, Node, Tile } from "..";
import { PacketHook, Plugin } from "../decorators";
import { NodeMap } from "../services/pathfinding";

@Plugin({
    name: "Map Plugin",
    author: "Extacy",
    instantiate: false
})
export class MapPlugin extends NodeMap {

    private client: Client;
    public emitter: TypedEmitter<MapEvents>;

    public mapInfo: MapInfoPacket;
    public key: number[];
    public keyTime: number;
    public gameId: GameId;

    public portals: Portal[];

    constructor(client: Client) {
        super();

        this.client = client;
        this.emitter = new EventEmitter();
        this.key = [];
        this.keyTime = -1;
        this.gameId = GameId.Nexus;
        this.portals = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
    }

    public toNodeMap(): NodeMap<Node> {
        const map = new NodeMap<Node>();
        map.width = this.width;
        map.height = this.height;

        // Convert Tiles into Nodes
        map.node = [];
        for (let x = 0; x < map.width; x++) {
            map.node[x] = [];
            for (let y = 0; y < map.height; y++) {
                const tile = this.node[x][y];
                map.node[x][y] = Node.fromTile(tile);
            }
        }

        return map;
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.mapInfo = mapInfoPacket;
        this.portals = [];

        this.width = this.mapInfo.width;
        this.height = this.mapInfo.height;

        // Create new a new empty tile map
        this.node = [];
        for (let x = 0; x < this.mapInfo.width; x++) {
            this.node[x] = [];
            for (let y = 0; y < this.mapInfo.height; y++) {
                this.node[x][y] = new Tile(x, y);
            }
        }
    }

    @PacketHook()
    private onUpdate(updatePacket: UpdatePacket): void {

        const unwalkableTiles: Tile[] = [];

        // Tiles
        for (const tile of updatePacket.tiles) {
            const tileXML = this.client.runtime.resources.tiles[tile.type];
            if (!tileXML) {
                Logger.log("Map", `Could not find Tile with type ${tile.type}`, LogLevel.Warning);
                continue;
            }

            this.node[tile.x][tile.y].xml = tileXML;

            if (!Tile.IsWalkable(tileXML)) {
                unwalkableTiles.push(new Tile(tile.x, tile.y, tileXML));
            }
        }

        // New Objects
        for (const newObject of updatePacket.newObjects) {

            // Portals
            const portalXML = this.client.runtime.resources.portals[newObject.objectType];
            if (portalXML) {
                const portal = new Portal(newObject, portalXML);
                this.portals.push(portal);
                this.emitter.emit("portalOpen", portal);
                continue;
            }

            const objectXML = this.client.runtime.resources.objects[newObject.objectType];
            if (objectXML?.fullOccupy || objectXML?.occupySquare) {
                const pos = newObject.status.pos;
                const x = Math.floor(pos.x);
                const y = Math.floor(pos.y);
                this.node[x][y].occupied = true;
                unwalkableTiles.push(new Tile(pos.x, pos.y));
            }
        }

        // Drops
        for (const objectId of updatePacket.drops) {
            const portalIndex = this.portals.findIndex((value) => value.objectID == objectId);
            if (portalIndex != -1) {
                this.emitter.emit("portalRemoved", this.portals[portalIndex]);
                this.portals.slice(portalIndex, 1);
                continue;
            }
        }

        // Retrace pathfinder path if necessary
        if (this.client.pathfinding) {
            for (const tile of unwalkableTiles) {
                for (const path of this.client.pathfinding.path) {
                    if (tile.distanceTo(path) <= 1.0) {
                        this.client.pathfinding.retracePath();
                        return;
                    }
                }
            }
        }
    }

    @PacketHook()
    private onNewTick(newTickPacket: NewTickPacket, client: Client): void {

        for (const status of newTickPacket.statuses) {
            const portal = this.portals.find((portal) => portal.objectID == status.objectId);
            if (portal) {
                this.emitter.emit("portalUpdate", portal);
                continue;
            }
        }
    }
}

interface MapEvents {
    portalOpen: (portal: Portal) => void,
    portalUpdate: (portal: Portal) => void,
    portalRemoved: (portal: Portal) => void,
}
