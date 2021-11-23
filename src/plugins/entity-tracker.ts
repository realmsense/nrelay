import TypedEmitter from "typed-emitter";
import { EventEmitter } from "events";
import { UpdatePacket, NewTickPacket, ObjectStatusData, MapInfoPacket } from "realmlib";
import { Player, Enemy, Pet, Client } from "..";
import { PacketHook, Plugin } from "../decorators";
import { Classes } from "../../shared/src";

type TrackedEntity = Player | Enemy | Pet;

const instances: EntityTracker[] = [];

@Plugin({
    name: "Entity Tracker",
    author: "Extacy",
    instantiate: false
})
export class EntityTracker {

    private client: Client;
    public emitter: TypedEmitter<PlayerTrackerEvents>;

    public players: Player[];
    public enemies: Enemy[];
    public pets: Pet[];

    constructor(client: Client) {
        this.client = client;
        this.emitter = new EventEmitter();
        this.players = [];
        this.enemies = [];
        this.pets = [];

        this.client.runtime.pluginManager.hookInstance(client, this);
        instances.push(this);
    }

    public static getAllPlayers(): Player[] {
        const players: Player[] = [];
        for (const instance of instances) {
            for (const player of instance.players) {
                if (players.find((value) => value.objectID == player.objectID)) continue;
                players.push(player);
            }
        }
        return players;
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {
        this.players = [];
        this.enemies = [];
        this.pets = [];
    }

    @PacketHook()
    private onUpdate(updatePacket: UpdatePacket, client: Client): void {

        for (const newObject of updatePacket.newObjects) {

            // Players
            if (newObject.objectType in Classes) {
                // Update player
                const foundPlayer = this.updateEntity(newObject.status, this.players) as Player;
                if (foundPlayer) {
                    this.emitter.emit("playerUpdate", foundPlayer);
                    continue;
                }

                // Add player
                const player = new Player(newObject);
                player.server = client.server;
                player.location = client.location;

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
    private onNewTick(newTickPacket: NewTickPacket, client: Client): void {

        for (const status of newTickPacket.statuses) {
            const foundPlayer = this.updateEntity(status, this.players) as Player;
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
        entity.parseObjectStatus(status);
        return entity;
    }
}

// Event Declarations
interface PlayerTrackerEvents {
    playerEnter: (player: Player) => void,
    playerLeave: (player: Player) => void,
    playerUpdate: (player: Player) => void,

    enemyEnter: (enemy: Enemy) => void,
    enemyLeave: (enemy: Enemy) => void,
    enemyUpdate: (enemy: Enemy) => void,

    petEnter: (pet: Pet) => void,
    petLeave: (pet: Pet) => void,
    petUpdate: (pet: Pet) => void,
}
