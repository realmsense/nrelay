import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { ConditionEffect} from "realmlib";
import { MapInfoPacket, NodeUpdate, Pathfinder, Point, UpdatePacket } from "..";
import { Client } from "../core";
import { Plugin, PacketHook } from "../decorators";

@Plugin({
    name: "Pathfinding Plugin",
    author: "Extacy",
    instantiate: false
})
export class PathfindingPlugin {

    public readonly emitter: TypedEmitter<PathfindingEvent>;

    private client: Client;
    private lastTickTime: number;

    private pathfinder: Pathfinder;
    private target: Point;
    private path: Point[];

    constructor(client: Client) {
        this.emitter = new EventEmitter();
        this.client = client;
        this.pathfinder = new Pathfinder();
        this.target = null;
        this.path = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
    }

    public async findPath(target: Point): Promise<void> {
        const start = this.client.worldPos.floor();
        this.target = target.floor();

        const path = this.pathfinder.findPath(start, this.target);
        if (path?.length == 0) {
            this.emitter.emit("noPath");
            return;
        }

        this.path = path;
        this.emitter.emit("foundPath", path);
    }

    public moveNext(delta: number): void {

        if (this.path.length == 0) return;

        const target = this.path[0];
        const step = this.client.getMoveSpeed() * delta;
        const squareDistance = this.client.worldPos.squareDistanceTo(target);

        // too far to walk to in one tick, move as far as we can.
        if (squareDistance > step ** 2) {
            const angle = this.client.worldPos.angleTo(target);
            const pos = new Point(
                this.client.worldPos.x + (step * Math.cos(angle)),
                this.client.worldPos.y + (step * Math.sin(angle)),
            );

            this.moveTo(pos);
            return;
        }

        this.moveTo(target);
        this.path.shift();

        if (this.path.length == 0) {
            this.emitter.emit("arrived", this.client.worldPos.clone());
        }
    }

    public moveTo(point: Point): boolean {
        if (this.client.hasEffect(ConditionEffect.PARALYZED | ConditionEffect.PAUSED))
            return false;

        this.client.worldPos.x = point.x;
        this.client.worldPos.y = point.y;
        this.emitter.emit("move", this.client.worldPos.clone());
        return true;
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.pathfinder.setMapSize(mapInfoPacket.width, mapInfoPacket.height);
        this.path = [];
        this.lastTickTime = this.client.getTime();
    }

    @PacketHook()
    private onUpdate(updatePacket: UpdatePacket): void {
        const pathfinderUpdates: NodeUpdate[] = [];

        // nowalk tiles
        for (const tile of updatePacket.tiles) {
            const tileXML = this.client.runtime.resources.tiles[tile.type];
            if (tileXML?.noWalk) {
                pathfinderUpdates.push({
                    x: Math.floor(tile.x),
                    y: Math.floor(tile.y),
                    walkable: false
                });
            }
        }

        // occupy objects
        for (const newObject of updatePacket.newObjects) {
            const objectXML = this.client.runtime.resources.objects[newObject.objectType];
            if (objectXML?.fullOccupy || objectXML?.occupySquare) {
                pathfinderUpdates.push({
                    x: Math.floor(newObject.status.pos.x),
                    y: Math.floor(newObject.status.pos.y),
                    walkable: false
                });
            }
        }

        // Update pathfinder with new unwalkable nodes
        if (pathfinderUpdates.length > 0) {
            this.pathfinder.updateWalkableNodes(pathfinderUpdates);
            // retrace path with new unwalkable tiles
            if (this.target) {
                this.findPath(this.target);
            }
        }
    }
}

export interface PathfindingEvent {
    foundPath: (path: Point[]) => void,
    noPath: () => void,
    move: (point: Point) => void,
    arrived: (point: Point) => void,
}