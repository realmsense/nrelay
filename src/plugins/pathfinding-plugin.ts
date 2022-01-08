import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { ConditionEffect, MovePacket, NewTickPacket } from "realmlib";
import { Client, MapInfoPacket, Point, Heuristic, AStar } from "..";
import { Plugin, PacketHook } from "../decorators";

@Plugin({
    name: "Pathfinding Plugin",
    author: "Extacy",
    instantiate: false
})
export class PathfindingPlugin {

    public readonly emitter: TypedEmitter<PathfindingEvent>;

    private client: Client;
    private lastMoveTime: number;
    
    private pathfinder: AStar;
    private target: Point | null;
    public path: Point[];

    constructor(client: Client) {
        this.emitter = new EventEmitter();
        this.client = client;
        this.pathfinder = new AStar(Heuristic.manhattan, true);
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
    public findPath(target: Point, emitEvents = true): void {
        const start = this.client.worldPos;
        const nodeMap = this.client.map.toNodeMap();
        const path = this.pathfinder.findPath(start.floor(), target.floor(), nodeMap);

        if (path.length == 0) {
            if (emitEvents) {
                this.emitter.emit("noPath");
            }
            this.target = null;
            return;
        }

        // Set exact coordinates (findPath works with floored points)
        path[0] = start;
        path.push(target);

        this.path = path;
        this.target = target;

        if (emitEvents) {
            this.emitter.emit("foundPath", path);
        }
    }

    public retracePath(): void {
        if (!this.target) return;
        this.path = [];
        return this.findPath(this.target, true);
    }

    /**
     * Moves the client as far possible, following our target path.
     * @param delta The difference in time since the client last moved.
     * @return `true` if the player was moved and a MovePacket should be sent. `false` if we should delay movement, skip sending the MovePacket.
     */
    private moveNext(delta: number): boolean {
        const target = this.path[0];
        const step = this.client.getMoveSpeed() * delta; // The maxmimum distance we can move in this tick
        const squareDistance = this.client.worldPos.squareDistanceTo(target);
        const canMove = squareDistance < step ** 2;
        
        // too far to walk to in one tick, move as far as we can.
        // TODO: The client sometimes walks into unwalkable tiles here
        if (!canMove) {
            const angle = this.client.worldPos.angleTo(target);
            const pos = new Point(
                this.client.worldPos.x + (step * Math.cos(angle)),
                this.client.worldPos.y + (step * Math.sin(angle)),
            );
    
            return this.moveTo(pos);
        }

        const moved = this.moveTo(target);
        if (moved) {
            this.path.shift();
        }
        return moved;
    }

    /**
     * Safely update the client's position, respecting unwalkable tiles and condition effects.
     */
    private moveTo(point: Point): boolean {
        if (this.client.hasEffect(ConditionEffect.PARALYZED | ConditionEffect.PAUSED))
            return false;

        const tile = this.client.map.getNodeAt(point);
        if (!tile?.walkable) {
            return false;
        }

        this.client.worldPos.x = point.x;
        this.client.worldPos.y = point.y;
        this.emitter.emit("move", this.client.worldPos.clone());
        return true;
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.path = [];
        this.lastMoveTime = this.client.getTime();
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
        const delta = time - this.lastMoveTime;
        
        if (this.target && this.path.length > 0) {
            const moved = this.moveNext(delta);
            if (!moved) return;
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
        this.lastMoveTime = time;
    }
}

export interface PathfindingEvent {
    foundPath: (path: Point[]) => void,
    noPath: () => void,
    move: (point: Point) => void,
    arrived: (point: Point) => void,
}