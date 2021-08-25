import TypedEmitter from "typed-emitter";
import { EventEmitter } from "events";
import { UpdatePacket, Classes, NewTickPacket, ObjectStatusData } from "realmlib";
import { _Player, _Enemy, _Pet, Client, _Entity } from "..";
import { PacketHook, Plugin } from "../decorators";

type TrackedEntity = _Player | _Enemy | _Pet;

const instances: EntityTracker[] = [];

@Plugin({
    name: "Entity Tracker",
    author: "Extacy",
    instantiate: false
})
export class EntityTracker {

    private client: Client;
    public emitter: TypedEmitter<PlayerTrackerEvents>;

    public players: _Player[];
    public enemies: _Enemy[];
    public pets: _Pet[];

    constructor(client: Client) {
        this.client = client;
        this.emitter = new EventEmitter();
        this.players = [];
        this.enemies = [];
        this.pets = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
        instances.push(this);
    }

    public static getAllPlayers(): _Player[] {
        const players: _Player[] = [];
        for (const instance of instances) {
            for (const player of instance.players) {
                if (players.find((value) => value.objectID == player.objectID)) continue;
                players.push(player);
            }
        }
        return players;
    }

    @PacketHook()
    public onUpdate(updatePacket: UpdatePacket, client: Client): void {

        for (const newObject of updatePacket.newObjects) {

            // Players
            if (newObject.objectType in Classes) {
                // Update player
                const foundPlayer = this.updateEntity(newObject.status, this.players) as _Player;
                if (foundPlayer) {
                    this.emitter.emit("playerUpdate", foundPlayer);
                    continue;
                }

                // Add player
                const player = new _Player(newObject.status);
                this.players.push(player);
                this.emitter.emit("playerEnter", player);
                continue;
            }

            // TODO:
            // * Enemies
            // * Pets
            // Update parsing objects in resources manager
        }

        for (const objectId of updatePacket.drops) {
            // Remove player
            const foundIndex = this.players.findIndex((value) => value.objectID == objectId);
            if (foundIndex != -1) {
                this.emitter.emit("playerLeave", this.players[foundIndex]);
                this.players.splice(foundIndex, 1);
                continue;
            }
        }
    }

    @PacketHook()
    public onNewTick(newTickPacket: NewTickPacket, client: Client): void {

        for (const status of newTickPacket.statuses) {
            const foundPlayer = this.updateEntity(status, this.players) as _Player;
            if (foundPlayer) {
                this.emitter.emit("playerUpdate", foundPlayer);
                continue;
            }
        }
    }

    private updateEntity(status: ObjectStatusData, list: TrackedEntity[]): TrackedEntity | null {
        const index = list.findIndex((value) => value.objectID == status.objectId);
        if (index == -1) return null;

        const entity = list[index];
        entity.parseStatus(status);
        return entity;
    }
}

// Event Declarations
interface PlayerTrackerEvents {
    playerEnter: (player: _Player) => void,
    playerLeave: (player: _Player) => void,
    playerUpdate: (player: _Player) => void,

    enemyEnter: (enemy: _Enemy) => void,
    enemyLeave: (enemy: _Enemy) => void,
    enemyUpdate: (enemy: _Enemy) => void,

    petEnter: (pet: _Pet) => void,
    petLeave: (pet: _Pet) => void,
    petUpdate: (pet: _Pet) => void,
}
