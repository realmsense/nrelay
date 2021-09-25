import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { ConditionEffect, MovePacket, NewTickPacket } from "realmlib";
import { Client, MapInfoPacket, NodeUpdate, Pathfinder, Point, UpdatePacket, Heuristic } from "..";
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
    private target: Point | null;
    private path: Point[];

    constructor(client: Client) {
        this.emitter = new EventEmitter();
        this.client = client;
        this.pathfinder = new Pathfinder(Heuristic.euclidian);
        this.target = null;
        this.path = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
    }

    public stop(): void {
        this.target = null;
        this.path = [];
    }

    /**
     * Finds a path to the specified coordinates and will continue to follow the path.
     * This function will emit the following events whether a path is found: `foundPath` or `noPath`.
     * Once the client arrives at the target coordinate, it will emit the `arrived` event.
     * @param emitEvents Whether to emit the "noPath" or "foundPath" events. (This should be true unless we are recalculating an existing path)
     */
    public async findPath(target: Point, emitEvents = true): Promise<void> {
        const start = this.client.worldPos;
        const path = this.pathfinder.findPath(start.floor(), target.floor());

        if (path?.length == 0) {
            if (emitEvents) {
                this.emitter.emit("noPath");
            }
            this.target = null;
            return;
        }

        path.push(target);
        this.path = path;
        this.target = target;
        if (emitEvents) {
            this.emitter.emit("foundPath", path);
        }
    }

    /**
     * Moves the client as far possible, following our target path.
     * @param delta The difference in time since the client last moved.
     */
    private moveNext(delta: number): void {

        const target = this.path[0];
        const step = this.client.getMoveSpeed() * delta;
        const squareDistance = this.client.worldPos.squareDistanceTo(target);

        // too far to walk to in one tick, move as far as we can.
        // TODO: The client sometimes walks into unwalkable tiles here
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
    }

    /**
     * Safely move the client, respecting the `PARALYZED` ConditionEffect.
     */
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

            // Retrace our current path if we are going to walk through any unwalkable tiles.
            if (this.target && this.path.length > 0) {
                for (const update of pathfinderUpdates) {
                    for (const path of this.path) {
                        const point = new Point(update.x, update.y);
                        if (point.distanceTo(path) <= 1.0) {
                            this.findPath(this.target, false);
                            return;
                        }
                    }
                }
            }
        }
    }

    @PacketHook()
    private onNewTick(newTickPacket: NewTickPacket): void {

        for (const status of newTickPacket.statuses) {
            if (status.objectId == this.client.objectId) {
                this.client.parseObjectStatus(status);
                
                // Don't change our worldPos if we have a path to follow.
                if (this.target) {

                    // if we arrived at our path, we should wait until the server acknowledges
                    // our new position. Otherwise, our worldPos will be overwritten
                    if (this.path.length == 0 && this.client.worldPos.equalTo(this.target)) {
                        this.emitter.emit("arrived", this.target);
                        this.target = null;
                    }
                    continue;
                }
                this.client.worldPos = status.pos;
            }
        }

        const time = this.client.getTime();
        const delta = time - this.lastTickTime;
        this.lastTickTime = time;

        if (this.target && this.path.length > 0) {
            this.moveNext(delta);
        }

        const movePacket = new MovePacket();
        movePacket.tickId = newTickPacket.tickId;
        movePacket.time = time;
        movePacket.serverRealTimeMS = newTickPacket.serverRealTimeMS;
        movePacket.newPosition = this.client.worldPos;
        movePacket.records = [];

        // MoveRecords might not even be read by the server at all.
        // It works perfectly fine with an empty array, and even completely random/invalid coordinates as well.
        // In other words, I'm too lazy to calculate them, heres the previous code from when they are added on every frame? (IIRC the game adds them every 0.2secs)

        // const lastClear = this.client.moveRecords.lastClearTime;
        // if (lastClear >= 0 && movePacket.time - lastClear > 125) {
        //     const len = Math.min(10, this.client.moveRecords.records.length);
        //     for (let i = 0; i < len; i++) {
        //         if (this.client.moveRecords.records[i].time >= movePacket.time - 25) {
        //             break;
        //         }
        //         movePacket.records.push(this.client.moveRecords.records[i].clone());
        //     }
        // }
        // this.client.moveRecords.clear(movePacket.time);

        this.client.packetIO.send(movePacket);
    }
}

export interface PathfindingEvent {
    foundPath: (path: Point[]) => void,
    noPath: () => void,
    move: (point: Point) => void,
    arrived: (point: Point) => void,
}