import { EventEmitter } from "events";
import { Socket } from "net";
import { AoeAckPacket, AoePacket, CreatePacket, CreateSuccessPacket, DamagePacket, DeathPacket, EnemyHitPacket, EnemyShootPacket, FailureCode, FailurePacket, GotoAckPacket, GotoPacket, GroundDamagePacket, GroundTileData, HelloPacket, InventorySwapPacket, LoadPacket, MapInfoPacket, MovePacket, NewTickPacket, NotificationPacket, OtherHitPacket, Packet, PacketIO, PacketMap, PingPacket, PlayerHitPacket, PlayerShootPacket, Point, PongPacket, ReconnectPacket, SlotObjectData, StatType, UpdateAckPacket, UpdatePacket, WorldPosData } from "realmlib";
import { AccessToken, generateRandomClientToken, VerifyAccessTokenResponse } from "../models/access-token";
import { Entity } from "../models/entity";
import { Events } from "../models/events";
import { GameId } from "../models/game-ids";
import { MapTile } from "../models/map-tile";
import { Runtime } from "../runtime/runtime";
import { getWaitTime } from "../runtime/scheduler";
import { AccountService, Logger, LogLevel, Random } from "../services";
import { NodeUpdate, Pathfinder } from "../services/pathfinding";
import { insideSquare } from "../util/math-util";
import { delay } from "../util/misc-util";
import { createConnection } from "../util/net-util";
import * as parsers from "../util/parsers";
import { getHooks, PacketHook } from "./../decorators";
import { Account, AccountInUseError, CharacterInfo, Classes, ConditionEffect, Enemy, GameObject, getDefaultPlayerData, hasEffect, MapInfo, MoveRecords, PlayerData, Projectile, Proxy, Server } from "./../models";

const MIN_MOVE_SPEED = 0.004;
const MAX_MOVE_SPEED = 0.0096;
const MIN_ATTACK_FREQ = 0.0015;
const MAX_ATTACK_FREQ = 0.008;
const MIN_ATTACK_MULT = 0.5;
const MAX_ATTACK_MULT = 2;
// TODO: REMOVE THIS UGLINESS

export class Client extends EventEmitter {

    // Core Modules
    public readonly runtime: Runtime;
    
    // Networking
    public io: PacketIO;
    public proxy: Proxy;

    // Player Data
    public playerData: PlayerData;
    public readonly charInfo: CharacterInfo;
    public objectId: number;
    public worldPos: WorldPosData;
    private needsNewCharacter: boolean;
    private clientHP: number;
    private hpLog: number;
    private hasPet: boolean;

    // Player Credentials
    public alias: string;
    public guid: string;
    public password: string;
    public clientToken: string;
    public accessToken: AccessToken;

    // Map Info
    public mapInfo: MapInfo;
    public mapTiles: MapTile[];
    public nextPos: WorldPosData[];
    private moveMultiplier: number;
    private tileMultiplier: number;
    private safeMap: boolean;
    private enemies: Map<number, Enemy>;
    private players: Map<number, Entity>;
    private key: number[];
    private keyTime: number;
    private gameId: GameId;
    
    // Pathfinding
    private pathfinder: Pathfinder;
    private pathfinderEnabled: boolean;
    private pathfinderTarget: Point;
    private moveRecords: MoveRecords;

    // Hack Settings
    public autoAim: boolean;
    private autoNexusThreshold: number; // TODO: percentage as a decimal? use a setter here?
    
    // Client Connection
    public server: Server;
    private nexusServer: Server;
    private clientSocket: Socket;
    private connected: boolean;
    private connectTime: number;

    private reconnectCooldown: number;
    private ignoreRecon: boolean;
    private blockReconnect: boolean;
    private blockNextUpdateAck: boolean;

    private lastTickTime: number;
    private lastTickId: number;
    private currentTickTime: number;
    
    private lastFrameTime: number;
    private frameUpdateTimer: NodeJS.Timer;
    
    private random: Random;
    private projectiles: Projectile[];
    private currentBulletId: number;
    private lastAttackTime: number;

    /**
     * Creates a new instance of the client and begins the connection process to the specified server.
     * @param server The server to connect to.
     * @param buildVersion The current build version of RotMG.
     * @param accInfo The account info to connect with.
     */
    constructor(runtime: Runtime, server: Server, accInfo: Account, accessToken: AccessToken, clientToken: string, proxy: Proxy) {
        super();
        this.runtime = runtime;
        this.alias = accInfo.alias;
        this.guid = accInfo.guid;
        this.password = accInfo.password;
        this.accessToken = accessToken;
        this.clientToken = clientToken;
        this.pathfinderEnabled = accInfo.pathfinder;
        this.playerData = getDefaultPlayerData();
        this.playerData.server = server.name;
        this.proxy = proxy;

        this.projectiles = [];
        this.enemies = new Map();
        this.players = new Map();
        this.nextPos = [];

        this.autoAim = true;
        this.blockReconnect = false;
        this.blockNextUpdateAck = false;
        this.ignoreRecon = false;

        this.connectTime = Date.now();
        this.connected = false;
        this.gameId = GameId.Nexus;
        this.moveMultiplier = 1;
        this.tileMultiplier = 1;
        this.autoNexusThreshold = 0.2;
        this.currentBulletId = 1;
        this.lastAttackTime = 0;
        this.key = [];
        this.keyTime = -1;
        this.hasPet = false;
        this.safeMap = true;
        this.hpLog = 0;
        this.clientHP = 0;

        if (accInfo.charInfo) {
            this.charInfo = accInfo.charInfo;
        } else {
            this.charInfo = { charId: 0, nextCharId: 1, maxNumChars: 1 };
        }
        this.needsNewCharacter = this.charInfo.charId < 1;
        this.server = Object.assign({}, server);
        this.nexusServer = Object.assign({}, server);
        this.reconnectCooldown = getWaitTime(this.proxy ? this.proxy.host : "");

        this.io = new PacketIO();

        // use a set here to eliminate duplicates.
        const requiredHooks = new Set(getHooks().map((hook) => hook.packet));
        for (const type of requiredHooks) {
            this.io.on(type, (data) => {
                this.runtime.libraryManager.callHooks(data as Packet, this);
            });
        }
        this.io.on("error", (err) => {
            Logger.log(
                this.alias,
                `Received PacketIO error: ${err.message}`,
                LogLevel.Error
            );
            Logger.log(this.alias, err.stack, LogLevel.Debug);
        });

        this.runtime.emit(Events.ClientCreated, this);

        if (accInfo.autoConnect) {
            Logger.log(
                this.alias,
                `Starting connection to ${server.name}`,
                LogLevel.Info,
            );
            this.connect();
        }
    }

    /**
     * Shoots a projectile at the specified angle.
     * @param angle The angle in radians to shoot towards.
     */
    public shoot(angle: number): boolean {

        const canShoot = !hasEffect(this.playerData.condition, ConditionEffect.STUNNED | ConditionEffect.PAUSED);
        if (!canShoot) {
            return false;
        }

        const time = this.getTime();
        const item = this.runtime.resources.items[this.playerData.inventory[0]];
        const attackPeriod = (1 / this.getAttackFrequency()) * (1 / item.rateOfFire);
        const numProjectiles = item.numProjectiles > 0 ? item.numProjectiles : 1;

        if (time < this.lastAttackTime + attackPeriod) {
            return false;
        }
        
        this.lastAttackTime = time;
        const arcRads = (item.arcGap * Math.PI) / 180;
        let totalArc = arcRads * (numProjectiles - 1);
        if (arcRads <= 0) {
            totalArc = 0;
        }
        
        angle -= totalArc / 2;
        for (let i = 0; i < numProjectiles; i++) {
            const shootPacket = new PlayerShootPacket();
            shootPacket.bulletId = this.getBulletId();
            shootPacket.containerType = item.type;
            shootPacket.time = time;
            shootPacket.startingPos = this.worldPos.clone();
            shootPacket.startingPos.x += Math.cos(angle) * 0.3;
            shootPacket.startingPos.y += Math.sin(angle) * 0.3;
            shootPacket.speedMult = this.playerData.projSpeedMult;
            shootPacket.lifeMult = this.playerData.projLifeMult;

            const unstable = hasEffect(this.playerData.condition, ConditionEffect.UNSTABLE);
            shootPacket.angle = !unstable ? angle : (Math.random() * 6.28318530717959);
            this.send(shootPacket);

            const containerProps = this.runtime.resources.objects[item.type];
            const newProj = new Projectile(
                item.type,
                containerProps,
                0,
                this.objectId,
                shootPacket.bulletId,
                angle,
                time,
                {
                    x: shootPacket.startingPos.x,
                    y: shootPacket.startingPos.y,
                }
            );

            this.projectiles.unshift(newProj);
            if (arcRads > 0) {
                angle += arcRads;
            }

            const projectile = item.projectile;
            let damage = this.random.nextIntInRange(
                projectile.minDamage,
                projectile.maxDamage
            );

            if (time > this.moveRecords.lastClearTime + 600) {
                damage = 0;
            }
            newProj.setDamage(damage * this.getAttackMultiplier());
        }

        return true;
    }

    /**
     * Removes all event listeners and releases any resources held by the client.
     * This should only be used when the client is no longer needed.
     */
    public destroy(processTick = true): void {
        // packet io.
        if (this.io) {
            this.io.detach();
        }

        // timers.
        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
        }

        if (this.connected) {
            this.connected = false;
            this.emit(Events.ClientDisconnect, this);
            this.runtime.emit(Events.ClientDisconnect, this);
        }

        // client socket
        if (this.clientSocket) {
            this.clientSocket.removeAllListeners("close");
            this.clientSocket.removeAllListeners("error");
            this.clientSocket.destroy();
        }

        // resources
        // if we're unlucky, a packet hook, or onFrame was called and preempted this method.
        // to avoid a nasty race condition, release these resources on the next tick after
        // the io has been detached and the frame timers have been stopped.
        if (processTick) {
            process.nextTick(() => {
                this.mapTiles = undefined;
                this.projectiles = undefined;
                this.enemies = undefined;
                this.io = undefined;
                this.clientSocket = undefined;
            });
        }
    }

    /**
     * Blocks the client from receiving or sending any packets but keeps the internal connection alive
     * This can be used for things like noclip or making the server think you disconnected
     */
    public blockConnections(): void {
        Logger.log(this.alias, "Client connection blocked", LogLevel.Error);
        this.connected = false;
        this.emit(Events.ClientBlocked, this);
        this.runtime.emit(Events.ClientBlocked, this);
        this.nextPos.length = 0;
        this.pathfinderTarget = undefined;
        this.io.detach();
        this.clientSocket = undefined;
        if (this.pathfinder) {
            this.pathfinder.destroy();
        }
        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
            this.frameUpdateTimer = undefined;
        }
    }

    /**
     * Connects the bot to the `server`.
     * @param server The server to connect to.
     * @param gameId An optional game id to use when connecting. Defaults to the current game id.
     */
    public connectToServer(server: Server, gameId = this.gameId): void {
        Logger.log(
            this.alias,
            `Switching server to ${server.name}`,
            LogLevel.Info
        );
        this.server = Object.assign({}, server);
        this.nexusServer = Object.assign({}, server);
        this.gameId = gameId;
        this.connect();
    }

    /**
     * Connects to the Nexus.
     */
    public connectToNexus(): void {
        Logger.log(this.alias, "Connecting to the Nexus", LogLevel.Info);
        this.gameId = GameId.Nexus;
        this.server = Object.assign({}, this.nexusServer);
        this.connect();
    }

    /**
     * Connects to `gameId` on the current server
     *  @param gameId The gameId to use upon connecting.
     */
    public changeGameId(gameId: GameId): void {
        Logger.log(this.alias, `Changing gameId to ${gameId}`, LogLevel.Info);
        this.gameId = gameId;
        this.connect();
    }

    /**
     * Returns how long the client has been connected for, in milliseconds.
     */
    public getTime(): number {
        return Date.now() - this.connectTime;
    }

    /**
     * Finds a path from the client's current position to the `to` point
     * and moves the client along the path.
     * @param to The point to navigate towards.
     */
    public findPath(to: Point): void {
        if (!this.pathfinderEnabled) {
            Logger.log(
                this.alias,
                "Pathfinding is not enabled on this account - please enable it in the accounts.json",
                LogLevel.Warning
            );
            return;
        }
        to.x = Math.floor(to.x);
        to.y = Math.floor(to.y);
        const clientPos = new WorldPosData(
            Math.floor(this.worldPos.x),
            Math.floor(this.worldPos.y)
        );
        this.pathfinder
            .findPath(clientPos, to)
            .then((path) => {
                if (path.length === 0) {
                    this.pathfinderTarget = undefined;
                    this.nextPos.length = 0;
                    this.emit(Events.ClientArrived, this, to);
                    this.runtime.emit(Events.ClientArrived, this, to);
                    return;
                }
                this.pathfinderTarget = to;
                this.nextPos.length = 0;
                this.nextPos.push(
                    ...path.map((p) => new WorldPosData(p.x + 0.5, p.y + 0.5))
                );
            })
            .catch((error: Error) => {
                Logger.log(
                    this.alias,
                    `Error finding path: ${error.message}`,
                    LogLevel.Error
                );
                Logger.log(this.alias, error.stack, LogLevel.Debug);
            });
    }

    /**
     * Returns the index of a map tile given a position and current map height
     * @param tile The current tile
     */
    public getMapTileIndex(tile: WorldPosData): number {
        const mapheight = this.mapInfo.height;
        return tile.y * mapheight + tile.x;
    }

    public walkTo(x: number, y: number): void {

        const paused = hasEffect(this.playerData.condition, ConditionEffect.PAUSED);
        const paralyzed = hasEffect(this.playerData.condition, ConditionEffect.PARALYZED);
        const paralyzedImmune = hasEffect(this.playerData.condition, ConditionEffect.PARALYZED_IMMUNE);
        const petrified = hasEffect(this.playerData.condition, ConditionEffect.PETRIFIED);
        const petrifiedImmune = hasEffect(this.playerData.condition, ConditionEffect.PETRIFIED_IMMUNE);
        if (
            paused
            || paralyzed && !paralyzedImmune
            || petrified && !petrifiedImmune
        ) {
            return;
        }

        const xTile = this.mapTiles[
            Math.floor(this.worldPos.y) * this.mapInfo.width + Math.floor(x)
        ];
        if (xTile && !xTile.occupied) {
            this.worldPos.x = x;
        }

        const yTile = this.mapTiles[
            Math.floor(y) * this.mapInfo.width + Math.floor(this.worldPos.x)
        ];
        if (yTile && !yTile.occupied) {
            this.worldPos.y = y;
        }
    }

    public swapToInventory(objectType: number, fromSlot: number, toSlot: number, container: number): void {
        const packet = new InventorySwapPacket();
        packet.position = this.worldPos;
        packet.time = this.lastFrameTime;

        const vaultSlot = new SlotObjectData();
        vaultSlot.objectId = container;
        vaultSlot.slotId = fromSlot;
        vaultSlot.objectType = objectType;
        packet.slotObject1 = vaultSlot;

        const inventory = new SlotObjectData();
        inventory.objectId = this.playerData.objectId;
        if (this.playerData.inventory[toSlot] === -1) {
            inventory.slotId = toSlot;
            inventory.objectType = -1;

            packet.slotObject2 = inventory;
            this.io.send(packet);
        } else {
            Logger.log(
                "Inventory Swapping",
                "Failed to swap as the inventory slot is full",
                LogLevel.Debug
            );
        }
    }

    // public swapToInventory(objectType: number, fromSlot: number, toSlot: number, container: number): void {
    //     if (this.playerData.inventory[toSlot] !== -1) {
    //         Logger.log(
    //             "Inventory Swapping",
    //             "Failed to swap as the inventory slot is not empty.",
    //             LogLevel.Debug
    //         );
    //     }

    //     const vaultSlot = new SlotObjectData();
    //     vaultSlot.objectId = container;
    //     vaultSlot.slotId = fromSlot;
    //     vaultSlot.objectType = objectType;

    //     const inventory = new SlotObjectData();
    //     inventory.objectId = this.playerData.objectId;
    //     inventory.slotId = toSlot;
    //     inventory.objectType = -1;

    //     const invSwapPacket = new InventorySwapPacket();
    //     invSwapPacket.position = this.worldPos;
    //     invSwapPacket.time = this.lastFrameTime;
    //     invSwapPacket.slotObject1 = vaultSlot;
    //     invSwapPacket.slotObject2 = inventory;
    //     this.io.send(invSwapPacket);
    // }

    /**
     * Applies some damage and returns whether or not the client should
     * return to the nexus.
     * @param amount The amount of damage to apply.
     * @param armorPiercing Whether or not the damage should be armor piercing.
     */
    private applyDamage(amount: number, armorPiercing: boolean, time: number): boolean {
        if (time === -1) {
            time = this.getTime();
        }

        // if the player is currently invincible, they take no damage.
        const invincible = ConditionEffect.INVINCIBLE | ConditionEffect.INVULNERABLE | ConditionEffect.PAUSED;
        if (hasEffect(this.playerData.condition, invincible)) {
            return false;
        }

        // work out the defense
        let def = this.playerData.def;
        if (hasEffect(this.playerData.condition, ConditionEffect.ARMORED)) {
            def *= 2;
        }

        if (armorPiercing || hasEffect(this.playerData.condition, ConditionEffect.ARMORBROKEN)) {
            def = 0;
        }

        // work out the actual damage.
        const min = (amount * 3) / 20;
        const actualDamage = Math.max(min, amount - def);

        // apply it and check for autonexusing.
        this.playerData.hp -= actualDamage;
        this.clientHP -= actualDamage;
        Logger.log(
            this.alias,
            `Took ${actualDamage.toFixed(0)} damage. At ${this.clientHP.toFixed(0)} health.`
        );

        return this.checkHealth(time);
    }

    private checkProjectiles(time: number): void {
        // iterate backwards so that removing an item won't skip any projectiles.
        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            if (!this.projectiles[i].update(this.getTime())) {
                this.projectiles.splice(i, 1);
                continue;
            }
            if (this.projectiles[i].damagePlayers) {
                // check if it hit a wall
                const x = Math.floor(this.projectiles[i].currentPosition.x);
                const y = Math.floor(this.projectiles[i].currentPosition.y);

                // TODO: OPTIMIZE THIS
                const tileOccupied =
                    this.mapTiles[y * this.mapInfo.width + x] &&
                    this.mapTiles[y * this.mapInfo.width + x].occupied;
                if (
                    tileOccupied &&
                    !this.projectiles[i].projectileProperties.passesCover
                ) {
                    const otherHit = new OtherHitPacket();
                    otherHit.bulletId = this.projectiles[i].bulletId;
                    otherHit.objectId = this.projectiles[i].ownerObjectId;
                    otherHit.targetId = this.mapTiles[
                        y * this.mapInfo.width + x
                    ].occupiedBy;
                    otherHit.time = this.getTime();
                    this.send(otherHit);
                    this.projectiles.splice(i, 1);
                    Logger.log(
                        this.alias,
                        `Sent OtherHit for objectId ${otherHit.objectId}`,
                        LogLevel.Debug
                    );
                    continue;
                }

                // check if it hit the player.
                if (
                    insideSquare(
                        this.projectiles[i].currentPosition,
                        this.worldPos,
                        0.5
                    )
                ) {
                    // make sure we aren't applying damage twice.
                    const alreadyHit =
                        this.projectiles[i].projectileProperties.multiHit &&
                        this.projectiles[i].multiHit.has(this.objectId);
                    if (!alreadyHit) {
                        // apply the hit damage.
                        const nexused = this.applyDamage(
                            this.projectiles[i].damage,
                            this.projectiles[i].projectileProperties
                                .armorPiercing,
                            time
                        );
                        // only reply if we didn't get nexused
                        if (!nexused) {
                            const playerHit = new PlayerHitPacket();
                            playerHit.bulletId = this.projectiles[i].bulletId;
                            playerHit.objectId = this.projectiles[
                                i
                            ].ownerObjectId;
                            this.send(playerHit);
                            Logger.log(
                                this.alias,
                                `Sent PlayerHit to objectId ${playerHit.objectId}`,
                                LogLevel.Debug
                            );
                        }
                        if (this.projectiles[i].projectileProperties.multiHit) {
                            this.projectiles[i].multiHit.add(this.objectId);
                        } else {
                            this.projectiles.splice(i, 1);
                        }
                        continue;
                    }
                }

                // check if it hit another player.
                if (this.players.size > 0) {
                    // find the closest player
                    let closestPlayer: [number, Entity] = [Infinity, undefined];
                    for (const player of this.players.values()) {
                        const alreadyHit =
                            this.projectiles[i].projectileProperties.multiHit &&
                            this.projectiles[i].multiHit.has(
                                player.objectData.objectId
                            );
                        if (alreadyHit) {
                            continue;
                        }
                        const distance = player.squareDistanceTo(
                            this.projectiles[i].currentPosition
                        );
                        if (
                            distance < closestPlayer[0] &&
                            !hasEffect(
                                player.objectData.condition,
                                ConditionEffect.PAUSED
                            )
                        ) {
                            closestPlayer = [distance, player];
                        }
                    }
                    // if there is a player...
                    if (closestPlayer[1] !== undefined) {
                        // ...and they are less than 0.5 tiles away, hit them.
                        // TODO: check multiHit property.
                        if (
                            insideSquare(
                                this.projectiles[i].currentPosition,
                                closestPlayer[1].currentPos,
                                0.5
                            )
                        ) {
                            if (
                                this.projectiles[i].projectileProperties
                                    .multiHit
                            ) {
                                this.projectiles[i].multiHit.add(
                                    closestPlayer[1].objectData.objectId
                                );
                            } else {
                                const otherHit = new OtherHitPacket();
                                otherHit.bulletId = this.projectiles[
                                    i
                                ].bulletId;
                                otherHit.objectId = this.projectiles[
                                    i
                                ].ownerObjectId;
                                otherHit.targetId =
                                    closestPlayer[1].objectData.objectId;
                                otherHit.time = this.getTime();
                                this.send(otherHit);
                                this.projectiles.splice(i, 1);
                                Logger.log(
                                    this.alias,
                                    `Sent OtherHit for player: ${closestPlayer[1].objectData.name}`,
                                    LogLevel.Debug
                                );
                            }
                        }
                    }
                }
            } else {
                // find the closest enemy.
                let closestEnemy: [number, Enemy] = [Infinity, undefined];
                for (const enemy of this.enemies.values()) {
                    const alreadyHit =
                        this.projectiles[i].projectileProperties.multiHit &&
                        this.projectiles[i].multiHit.has(
                            enemy.objectData.objectId
                        );
                    if (alreadyHit) {
                        continue;
                    }
                    const dist = enemy.squareDistanceTo(
                        this.projectiles[i].currentPosition
                    );
                    if (dist < closestEnemy[0] && !enemy.dead) {
                        closestEnemy = [dist, enemy];
                    }
                }

                // if there is an enemy...
                if (closestEnemy[1] !== undefined) {
                    // ...and they are less than 0.5 tiles away, hit them.
                    if (
                        insideSquare(
                            this.projectiles[i].currentPosition,
                            closestEnemy[1].currentPos,
                            0.5
                        )
                    ) {
                        const enemyHit = new EnemyHitPacket();
                        const piercing = this.projectiles[i]
                            .projectileProperties.armorPiercing;
                        const damage = closestEnemy[1].damage(
                            this.projectiles[i].damage,
                            piercing
                        );
                        enemyHit.bulletId = this.projectiles[i].bulletId;
                        enemyHit.targetId = closestEnemy[1].objectData.objectId;
                        enemyHit.time = this.getTime();
                        enemyHit.kill = closestEnemy[1].objectData.hp <= damage;
                        this.send(enemyHit);
                        Logger.log(
                            this.alias,
                            `Sent EnemyHit (kill = ${enemyHit.kill}) (id = ${enemyHit.targetId})`,
                            LogLevel.Debug
                        );
                        if (this.projectiles[i].projectileProperties.multiHit) {
                            this.projectiles[i].multiHit.add(
                                closestEnemy[1].objectData.objectId
                            );
                        } else {
                            this.projectiles.splice(i, 1);
                        }
                        if (enemyHit.kill) {
                            closestEnemy[1].dead = true;
                        }
                    }
                }
            }
        }
    }

    /**
     * Checks whether or not the client should take damage from
     * the tile they are currently standing on.
     */
    private checkGroundDamage(time: number): void {
        const x = Math.floor(this.worldPos.x);
        const y = Math.floor(this.worldPos.y);
        const tile = this.mapTiles[y * this.mapInfo.width + x];

        // if there is no tile, return.
        if (!tile) {
            return;
        }

        // don't damage if the last damage was less than 500 ms ago.
        const now = this.getTime();
        if (tile.lastDamage + 500 > now) {
            return;
        }

        // don't damage if the tile is protected from ground damage.
        if (tile.protectFromGroundDamage) {
            return;
        }

        // if the tile actually does damage.
        const props = this.runtime.resources.tiles[tile.type];
        if (props.minDamage !== undefined && props.maxDamage !== undefined) {
            // get the damage.
            const damage = this.random.nextIntInRange(props.minDamage, props.maxDamage);
            tile.lastDamage = now;

            // apply it and only send the response if the client didn't nexus.
            const nexused = this.applyDamage(damage, true, time);
            if (!nexused) {
                const groundDamage = new GroundDamagePacket();
                groundDamage.time = now;
                groundDamage.position = this.worldPos.clone();
                this.send(groundDamage);
            }
        }
    }

    @PacketHook()
    private onDamage(damage: DamagePacket): void {
        // remove the projectile if it's in our list.
        // TODO: handle multi hit
        this.projectiles = this.projectiles.filter(
            (p) => 
                damage.objectId !== p.ownerObjectId
                || damage.bulletId !== p.bulletId
        );

        // if the bullet hit an enemy, do damage to that enemy
        if (this.enemies.has(damage.targetId)) {
            // TODO: Rewrite projectile functionality
            // const enemy = this.enemies.get(damage.targetId);
            // if (damage.kill) {
            //     enemy.dead = true;
            // }
        }
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {

        // Maps that are guaranteed to have no enemies.
        const safeNames = ["Nexus", "Guild Hall", "Pet Yard", "Vault", "Daily Quest", "Cloth Bazaar"];
        this.safeMap = safeNames.includes(mapInfoPacket.name);

        if (this.needsNewCharacter) {
            // create the character.
            const createPacket = new CreatePacket();
            createPacket.classType = Classes.Wizard;
            createPacket.skinType = 0;
            Logger.log(this.alias, "Creating new character", LogLevel.Info);
            this.send(createPacket);
            this.needsNewCharacter = false;
            // update the char info cache.
            this.charInfo.charId = this.charInfo.nextCharId;
            this.charInfo.nextCharId += 1;
            this.runtime.accountService.updateCharInfoCache(
                this.guid,
                this.charInfo
            );
        } else {
            const loadPacket = new LoadPacket();
            loadPacket.charId = this.charInfo.charId;
            Logger.log(
                this.alias,
                `Connecting to ${mapInfoPacket.name}`,
                LogLevel.Info
            );
            this.send(loadPacket);
        }
        this.random = new Random(mapInfoPacket.fp);
        this.mapTiles = [];
        this.mapInfo = {
            width: mapInfoPacket.width,
            height: mapInfoPacket.height,
            name: mapInfoPacket.name,
        };
        if (this.pathfinderEnabled) {
            this.pathfinder = new Pathfinder(mapInfoPacket.width);
        }
    }

    @PacketHook()
    private onDeath(deathPacket: DeathPacket): void {
        // check if it was our client that died
        if (deathPacket.accountId !== this.playerData.accountId) {
            return;
        }

        Logger.log(
            this.alias,
            `The character ${deathPacket.charId} has died`,
            LogLevel.Warning
        );

        // update the char info.
        this.charInfo.charId = this.charInfo.nextCharId;
        this.charInfo.nextCharId++;
        this.needsNewCharacter = true;

        // update the char info cache.
        this.runtime.accountService.updateCharInfoCache(
            this.guid,
            this.charInfo
        );

        Logger.log(this.alias, "Connecting to the nexus..", LogLevel.Info);
        this.connectToNexus();
    }

    @PacketHook()
    private onNotification(notification: NotificationPacket): void {
        if (notification.objectId !== this.objectId) {
            return;
        }

        let json: any = "";
        try {
            json = JSON.parse(notification.message);
        } catch {
            Logger.log(
                this.alias,
                `Received non-json notification: "${notification.message}"`,
                LogLevel.Error
            );
            return;
        }

        if (
            json.key === "server.plus_symbol"
            && notification.color === 0x00ff00
        ) {
            const healAmount = parseInt(json.tokens.amount, 10);
            this.addHealth(healAmount);
        }
    }

    @PacketHook()
    private onUpdate(updatePacket: UpdatePacket): void {
        if (!this.blockNextUpdateAck) {
            const updateAck = new UpdateAckPacket();
            this.send(updateAck);
        } else {
            this.blockNextUpdateAck = false;
        }

        const pathfinderUpdates: NodeUpdate[] = [];

        for (const obj of updatePacket.newObjects) {
            if (obj.status.objectId === this.objectId) {
                for (const stat of obj.status.stats) {
                    if (stat.statType === StatType.HP_STAT) {
                        this.clientHP = stat.statValue;
                        break;
                    }
                }
                this.worldPos = obj.status.pos;
                this.playerData = parsers.processObject(obj);
                this.playerData.server = this.server.name;
                continue;
            }

            if (obj.status.objectId === this.objectId + 1) {
                if (this.runtime.resources.pets[obj.objectType] !== undefined) {
                    Logger.log(this.alias, "Detected pet", LogLevel.Debug);
                    this.hasPet = true;
                }
            }

            if (Classes[obj.objectType]) {
                const player = new Entity(obj.status);
                this.players.set(obj.status.objectId, player);
                continue;
            }

            if (this.runtime.resources.objects[obj.objectType]) {
                const gameObject: GameObject = this.runtime.resources.objects[obj.objectType];
                
                if (gameObject.enemy) {
                    if (!this.enemies.has(obj.status.objectId)) {
                        this.enemies.set(
                            obj.status.objectId,
                            new Enemy(gameObject, obj.status)
                        );
                    }
                    continue;
                }

                if (gameObject.fullOccupy || gameObject.occupySquare || gameObject.protectFromGroundDamage) {
                    const x = obj.status.pos.x;
                    const y = obj.status.pos.y;

                    const index = Math.floor(y) * this.mapInfo.width + Math.floor(x);
                    if (!this.mapTiles[index]) {
                        this.mapTiles[index] = new GroundTileData() as MapTile;
                    }

                    if (gameObject.fullOccupy || gameObject.occupySquare) {
                        this.mapTiles[index].occupied = true;
                        this.mapTiles[index].occupiedBy = obj.status.objectId;

                        if (this.pathfinderEnabled) {
                            pathfinderUpdates.push({
                                x: Math.floor(x),
                                y: Math.floor(y),
                                walkable: false,
                            });
                        }
                    }

                    if (gameObject.protectFromGroundDamage) {
                        this.mapTiles[index].protectFromGroundDamage = true;
                    }
                }
            }
        }

        // map tiles
        for (const tile of updatePacket.tiles) {
            const index = tile.y * this.mapInfo.width + tile.x;
            if (!this.mapTiles[index]) {
                this.mapTiles[index] = {
                    ...tile,
                    read: tile.read,
                    write: tile.write,
                    occupied: false,
                    occupiedBy: undefined,
                    lastDamage: 0,
                    protectFromGroundDamage: false,
                };
            } else {
                this.mapTiles[index].x = tile.x;
                this.mapTiles[index].y = tile.y;
            }

            if (this.pathfinderEnabled) {
                if (this.runtime.resources.tiles[tile.type].noWalk) {
                    pathfinderUpdates.push({
                        x: Math.floor(tile.x),
                        y: Math.floor(tile.y),
                        walkable: false,
                    });
                }
            }
        }

        for (const drop of updatePacket.drops) {
            if (this.enemies.has(drop)) {
                this.enemies.delete(drop);
            }
            if (this.players.has(drop)) {
                this.players.delete(drop);
            }
        }

        if (pathfinderUpdates.length > 0 && this.pathfinderEnabled) {
            this.pathfinder.updateWalkableNodes(pathfinderUpdates);
            if (this.pathfinderTarget) {
                this.findPath(this.pathfinderTarget);
            }
        }
    }

    @PacketHook()
    private onReconnectPacket(reconnectPacket: ReconnectPacket): void {
        // check for reconnect blocking
        if (this.blockReconnect) {
            Logger.log(
                "Reconnect",
                `Blocked reconnect packet for ${reconnectPacket.name}`,
                LogLevel.Debug
            );
            return;
        }

        // if there is a new host, then switch to it
        if (reconnectPacket.host !== "") {
            this.server.address = reconnectPacket.host;
        }

        // same story with the name
        if (reconnectPacket.name !== "") {
            this.server.name = reconnectPacket.name;
        }
        
        this.gameId = reconnectPacket.gameId;
        this.key = reconnectPacket.key;
        this.keyTime = reconnectPacket.keyTime;
        this.connect();
    }

    @PacketHook()
    private onGotoPacket(gotoPacket: GotoPacket): void {
        const ack = new GotoAckPacket();
        ack.time = this.lastFrameTime;
        this.send(ack);

        if (gotoPacket.objectId === this.objectId) {
            this.worldPos = gotoPacket.position.clone();
        }

        let entity: Entity = null;
        if (this.enemies.has(gotoPacket.objectId)) {
            entity = this.enemies.get(gotoPacket.objectId);
        } else if (this.players.has(gotoPacket.objectId)) {
            entity = this.players.get(gotoPacket.objectId);
        }

        if (entity != null) {
            entity.onGoto(
                gotoPacket.position.x,
                gotoPacket.position.y,
                this.lastFrameTime
            );
        }
    }

    @PacketHook()
    private onFailurePacket(failurePacket: FailurePacket): void {
        switch (failurePacket.errorId) {
            case FailureCode.IncorrectVersion:
                Logger.log(
                    this.alias,
                    "Your Exalt build version is out of date - change the buildVersion in versions.json",
                    LogLevel.Error
                );
                process.exit(0);
                return;
            case FailureCode.InvalidTeleportTarget:
                Logger.log(
                    this.alias,
                    "Invalid teleport target",
                    LogLevel.Warning
                );
                return;
            case FailureCode.EmailVerificationNeeded:
                Logger.log(
                    this.alias,
                    "Failed to connect: account requires email verification",
                    LogLevel.Error
                );
                return;
            case FailureCode.BadKey:
                Logger.log(
                    this.alias,
                    "Failed to connect: invalid reconnect key used",
                    LogLevel.Error
                );
                this.key = [];
                this.gameId = GameId.Nexus;
                this.keyTime = -1;
                return;
            case FailureCode.ServerQueueFull:
                Logger.log(
                    this.alias,
                    `Server is full - waiting 5 seconds: ${failurePacket.errorDescription}`,
                    LogLevel.Warning
                );
                this.reconnectCooldown = 5000;
                return;
        }

        switch (failurePacket.errorDescription) {
            case "Character is dead":
                this.fixCharInfoCache();
                return;
            case "Character not found":
                Logger.log(
                    this.alias,
                    "No active characters. Creating new character.",
                    LogLevel.Info
                );
                this.needsNewCharacter = true;
                return;
            case "Your IP has been temporarily banned for abuse/hacking on this server [6] [FUB]":
                Logger.log(
                    this.alias,
                    `Client ${this.alias} is IP banned from this server - reconnecting in 5 minutes`,
                    LogLevel.Warning
                );
                this.reconnectCooldown = 1000 * 60 * 5;
                return;
            case "{\"key\":\"server.realm_full\"}":
                // ignore these messages for now
                return;
        }

        Logger.log(
            this.alias,
            `Received failure ${failurePacket.errorId}: "${failurePacket.errorDescription}"`,
            LogLevel.Error
        );

        if (AccountInUseError.regex.test(failurePacket.errorDescription)) {
            const timeout: any = AccountInUseError.regex.exec(failurePacket.errorDescription)[1];
            if (!isNaN(timeout)) {
                this.reconnectCooldown = parseInt(timeout, 10) * 1000;
            }
        }
    }

    @PacketHook()
    private onAoe(aoePacket: AoePacket): void {
        const aoeAck = new AoeAckPacket();
        aoeAck.time = this.lastFrameTime;
        aoeAck.position = this.worldPos.clone();
        let nexused = false;

        const diameter = Math.pow(aoePacket.radius, 2);
        const distance = aoePacket.pos.squareDistanceTo(this.worldPos);
        if (distance < diameter) {
            // apply the aoe damage if in range.
            nexused = this.applyDamage(
                aoePacket.damage,
                aoePacket.armorPiercing,
                this.getTime()
            );
        }

        // only reply if the client didn't nexus.
        if (!nexused) {
            this.send(aoeAck);
        }
    }

    @PacketHook()
    private onNewTick(newTickPacket: NewTickPacket): void {
        this.lastTickTime = this.currentTickTime;
        this.lastTickId = newTickPacket.tickId;
        this.currentTickTime = this.getTime();

        const movePacket = new MovePacket();
        movePacket.tickId = newTickPacket.tickId;
        movePacket.time = this.lastFrameTime;
        movePacket.serverRealTimeMS = newTickPacket.serverRealTimeMS;
        movePacket.newPosition = this.worldPos;
        movePacket.records = [];

        const lastClear = this.moveRecords.lastClearTime;
        if (lastClear >= 0 && movePacket.time - lastClear > 125) {
            const len = Math.min(10, this.moveRecords.records.length);
            for (let i = 0; i < len; i++) {
                if (this.moveRecords.records[i].time >= movePacket.time - 25) {
                    break;
                }
                movePacket.records.push(this.moveRecords.records[i].clone());
            }
        }
        this.moveRecords.clear(movePacket.time);
        this.send(movePacket);

        const x = Math.floor(this.worldPos.x);
        const y = Math.floor(this.worldPos.y);

        const tileId = y * this.mapInfo.width + x;
        const mapTile = this.mapTiles[tileId];
        const tile = this.runtime.resources.tiles[mapTile.type];
        if (mapTile && tile) {
            this.tileMultiplier = tile.speed;
        }

        const elapsedMS = this.currentTickTime - this.lastTickTime;

        for (const status of newTickPacket.statuses) {
            if (status.objectId === this.objectId) {
                this.playerData = parsers.processStatData(status.stats, this.playerData);
                this.playerData.objectId = this.objectId;
                this.playerData.worldPos = this.worldPos;
                this.playerData.server = this.server.name;
                continue;
            }

            let entity: Entity = null;
            if (this.enemies.has(status.objectId)) {
                entity = this.enemies.get(status.objectId);
            } else if (this.players.has(status.objectId)) {
                entity = this.players.get(status.objectId);
            }

            if (entity != null) {
                entity.onNewTick(
                    status,
                    elapsedMS,
                    newTickPacket.tickId,
                    this.lastFrameTime
                );
            }
        }

        // TODO: Move this to a plugin
        if (this.autoAim && this.enemies.size > 0 ) {
            const weaponSlot = this.playerData.inventory[0];
            if (weaponSlot == -1) {
                // no weapon equipped
                return;
            }
            
            const projectile = this.runtime.resources.items[weaponSlot].projectile;
            const distance = projectile.lifetimeMS * (projectile.speed / 10000);
            
            for (const enemy of this.enemies.values()) {
                if (enemy.squareDistanceTo(this.worldPos) < distance ** 2) {
                    const x = enemy.objectData.worldPos.x - this.worldPos.x;
                    const y = enemy.objectData.worldPos.y - this.worldPos.y;
                    const angle = Math.atan2(y, x);
                    this.shoot(angle);
                }
            }
        }
    }
    
    @PacketHook()
    private onPing(pingPacket: PingPacket): void {
        const pongPacket = new PongPacket();
        pongPacket.serial = pingPacket.serial;
        pongPacket.time = this.getTime();
        this.send(pongPacket);
    }

    @PacketHook()
    private onEnemyShoot(enemyShootPacket: EnemyShootPacket): void {
        const owner = this.enemies.get(enemyShootPacket.ownerId);
        // TODO: ShootAckPacket doesn't exist anymore
        // const shootAck = new ShootAckPacket();
        // shootAck.time = this.lastFrameTime;
        // if (!owner || owner.dead) {
        //     shootAck.time = -1;
        // }
        // this.send(shootAck);
        
        if (!owner || owner.dead) {
            return;
        }
        for (let i = 0; i < enemyShootPacket.numShots; i++) {
            const projectile = new Projectile(
                owner.properties.type,
                this.runtime.resources.objects[owner.properties.type],
                enemyShootPacket.bulletType,
                enemyShootPacket.ownerId,
                (enemyShootPacket.bulletId + i) % 256,
                enemyShootPacket.angle + i * enemyShootPacket.angleInc,
                this.lastFrameTime,
                enemyShootPacket.startingPos
            );
            projectile.setDamage(enemyShootPacket.damage);
            this.projectiles.unshift(projectile);
        }
    }

    // TODO: ShootAckPacket doesn't exist anymore
    // @PacketHook()
    // private onServerPlayerShoot(serverPlayerShoot: ServerPlayerShootPacket): void {
    //     if (serverPlayerShoot.ownerId === this.objectId) {
    //         const ack = new ShootAckPacket();
    //         if (this.hasPet) {
    //             ack.time = this.lastFrameTime;
    //         } else {
    //             ack.time = -1;
    //         }
    //         this.send(ack);
    //     }
    // }

    @PacketHook()
    private onCreateSuccess(createSuccessPacket: CreateSuccessPacket): void {
        Logger.log(this.alias, "Connected!", LogLevel.Success);
        this.objectId = createSuccessPacket.objectId;
        this.charInfo.charId = createSuccessPacket.charId;
        this.charInfo.nextCharId = this.charInfo.charId + 1;
        this.lastFrameTime = this.getTime();
        this.runtime.emit(Events.ClientReady, this);
        this.emit(Events.ClientReady, this);
        this.frameUpdateTimer = setInterval(this.onFrame.bind(this), 1000 / 30);
    }

    private onFrame() {
        const time = this.getTime();
        const delta = time - this.lastFrameTime;

        this.calcHealth(delta);
        if (this.checkHealth(time)) {
            return;
        }
        if (this.worldPos) {
            if (this.nextPos.length > 0) {
                /**
                 * We don't want to move further than we are allowed to, so if the
                 * timer was late (which is likely) we should use 1000/30 ms instead
                 * of the real time elapsed. Math.floor(1000/30) happens to be 33ms.
                 */
                const diff = Math.min(33, time - this.lastFrameTime);
                this.moveTo(this.nextPos[0], diff);
            }
            this.moveRecords.addRecord(time, this.worldPos.x, this.worldPos.y);
            this.checkGroundDamage(time);
        }
        if (this.players.size > 0) {
            for (const player of this.players.values()) {
                player.frameTick(this.lastTickId, time);
            }
        }
        if (this.enemies.size > 0) {
            for (const enemy of this.enemies.values()) {
                enemy.frameTick(this.lastTickId, time);
            }
        }
        if (this.projectiles.length > 0) {
            this.checkProjectiles(time);
        }
        this.lastFrameTime = time;
    }

    private onConnect(): void {
        Logger.log(
            this.alias,
            `Connected to ${this.server.name}!`,
            LogLevel.Debug
        );
        this.connected = true;
        this.emit(Events.ClientConnect, this);
        this.runtime.emit(Events.ClientConnect, this);
        this.lastTickTime = 0;
        this.lastAttackTime = 0;
        this.currentTickTime = 0;
        this.lastTickId = -1;
        this.currentBulletId = 1;
        this.hasPet = false;
        this.enemies.clear();
        this.players.clear();
        this.projectiles = [];
        this.moveRecords = new MoveRecords();
        this.worldPos = new WorldPosData(130, 120);
        this.sendHello();
    }

    private sendHello(): void {
        const helloPacket = new HelloPacket();
        helloPacket.buildVersion = this.runtime.buildVersion;
        helloPacket.gameId = this.gameId;
        helloPacket.accessToken = this.accessToken.token;
        helloPacket.keyTime = this.keyTime;
        helloPacket.key = this.key;
        helloPacket.gameNet = "rotmg";
        helloPacket.playPlatform = "rotmg";
        helloPacket.clientToken = this.clientToken;
        helloPacket.platformToken = "8bV53M5ysJdVjU4M97fh2g7BnPXhefnc";
        this.send(helloPacket);
    }

    private getBulletId(): number {
        const bId = this.currentBulletId;
        this.currentBulletId = (this.currentBulletId + 1) % 128;
        return bId;
    }

    private onClose(): void {
        Logger.log(
            this.alias,
            `The connection to ${this.nexusServer.name} was closed`,
            LogLevel.Warning
        );
        this.connected = false;
        this.emit(Events.ClientDisconnect, this);
        this.runtime.emit(Events.ClientDisconnect, this);
        this.nextPos.length = 0;
        this.pathfinderTarget = undefined;
        this.io.detach();
        this.clientSocket = undefined;
        if (this.pathfinder) {
            this.pathfinder.destroy();
        }

        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
            this.frameUpdateTimer = undefined;
        }
        if (this.reconnectCooldown <= 0) {
            this.reconnectCooldown = getWaitTime(
                this.proxy ? this.proxy.host : ""
            );
        }
        if (!this.blockReconnect) {
            this.connect();
        }
    }

    private onError(error: Error): void {
        Logger.log(
            this.alias,
            `Received socket error: ${error.message}`,
            LogLevel.Error
        );
        Logger.log(this.alias, error.stack, LogLevel.Debug);
    }

    /**
     * Fixes the character cache after a dead character has been loaded.
     */
    private fixCharInfoCache(): void {
        Logger.log(
            this.alias,
            "Tried to load a dead character. Fixing character info cache...",
            LogLevel.Debug
        );

        // update the char info
        this.charInfo.charId = this.charInfo.nextCharId;
        this.charInfo.nextCharId++;
        this.needsNewCharacter = true;

        // update the cache
        this.runtime.accountService.updateCharInfoCache(
            this.guid,
            this.charInfo
        );
    }

    private async connect(): Promise<void> {
        if (this.clientSocket) {
            this.clientSocket.destroy();
            return;
        }
        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
            this.frameUpdateTimer = undefined;
        }

        if (!this.ignoreRecon && this.reconnectCooldown > 0) {
            Logger.log(
                this.alias,
                `Connecting in ${this.reconnectCooldown / 1000} milliseconds`,
                LogLevel.Debug
            );
            await delay(this.reconnectCooldown);
        }

        await this.verifyAccessToken();

        try {
            if (this.proxy) {
                Logger.log(this.alias, "Establishing proxy", LogLevel.Debug);
            }
            const socket = await createConnection(
                this.server.address,
                2050,
                this.proxy
            );
            this.clientSocket = socket;

            // attach the packetio
            this.io.attach(this.clientSocket);

            // add the event listeners.
            this.clientSocket.on("close", this.onClose.bind(this));
            this.clientSocket.on("error", this.onError.bind(this));

            // perform the connection logic.
            this.onConnect();
        } catch (err) {
            Logger.log(
                this.alias,
                `Error while connecting: ${err.message}`,
                LogLevel.Error
            );
            Logger.log(this.alias, err.stack, LogLevel.Debug);
            this.reconnectCooldown = getWaitTime(
                this.proxy ? this.proxy.host : ""
            );
            this.emit(Events.ClientConnectError, this, err);
            this.runtime.emit(Events.ClientConnectError, this, err);
            this.connect();
        }
    }

    private async verifyAccessToken(): Promise<VerifyAccessTokenResponse> {

        Logger.log(this.alias, "Verifying AccessToken", LogLevel.Info);
        
        const tokenResponse = await AccountService.verifyAccessTokenClient(this.accessToken, this.clientToken, this.proxy);
        
        switch (tokenResponse) {
            case VerifyAccessTokenResponse.Success:
                Logger.log(this.alias, "AccessToken is valid.", LogLevel.Info);
                break;
            
            case VerifyAccessTokenResponse.ExpiredCanExtend:
                Logger.log(this.alias, "AccessToken is expired; extending.", LogLevel.Info);
                // TODO: AccountService.extendAccessToken();
                break;
            
            case VerifyAccessTokenResponse.ExpiredCannotExtend:
                Logger.log(this.alias, "AccessToken is expired; getting new AccessToken.", LogLevel.Info);
                this.accessToken = await AccountService.getAccessToken(this.guid, this.password, this.clientToken, this.proxy);
                break;
            
            case VerifyAccessTokenResponse.InvalidClientToken:
                Logger.log(this.alias, "ClientToken is invalid!", LogLevel.Warning);
                this.clientToken = generateRandomClientToken();
                this.accessToken = await AccountService.getAccessToken(this.guid, this.password, this.clientToken, this.proxy);

                // Could lead to an infinite loop (if the account is banned? or an error in getAccesssToken)
                // Probably doesn't matter, as that issue should be fixed as no clients would be able to connect
                this.verifyAccessToken();
                break;
        }

        return tokenResponse;
    }

    private moveTo(target: WorldPosData, timeElapsed: number): void {
        if (!target) {
            return;
        }
        const step = this.getSpeed(timeElapsed);
        if (this.worldPos.squareDistanceTo(target) > step ** 2) {
            const angle: number = Math.atan2(
                target.y - this.worldPos.y,
                target.x - this.worldPos.x
            );
            this.walkTo(
                this.worldPos.x + Math.cos(angle) * step,
                this.worldPos.y + Math.sin(angle) * step
            );
        } else {
            this.walkTo(target.x, target.y);
            const lastPos = this.nextPos.shift();
            if (this.nextPos.length === 0) {
                this.emit(Events.ClientArrived, this, lastPos);
                this.runtime.emit(Events.ClientArrived, this, lastPos);

                if (this.pathfinderTarget) {
                    this.pathfinderTarget = undefined;
                }
            }
        }
    }

    private getAttackMultiplier(): number {
        if (hasEffect(this.playerData.condition, ConditionEffect.WEAK)) {
            return MIN_ATTACK_MULT;
        }

        let attackMultiplier = MIN_ATTACK_MULT + (this.playerData.atk / 75) * (MAX_ATTACK_MULT - MIN_ATTACK_MULT);
        if (hasEffect(this.playerData.condition, ConditionEffect.DAMAGING)) {
            attackMultiplier *= 1.5;
        }
        
        return attackMultiplier;
    }

    private getSpeed(timeElapsed: number): number {

        const slowed = hasEffect(this.playerData.condition, ConditionEffect.SLOWED);
        const slowedImmune = hasEffect(this.playerData.condition, ConditionEffect.SLOWED_IMMUNE);
        if (slowed && !slowedImmune) {
            return MIN_MOVE_SPEED * this.tileMultiplier;
        }

        let speed =  MIN_MOVE_SPEED + (this.playerData.spd / 75) * (MAX_MOVE_SPEED - MIN_MOVE_SPEED);

        const speedy = hasEffect(this.playerData.condition, ConditionEffect.SPEEDY | ConditionEffect.NINJA_SPEEDY);
        if (speedy) {
            speed *= 1.5;
        }

        speed = speed * timeElapsed * this.tileMultiplier * this.moveMultiplier;
        return speed;
    }

    private getAttackFrequency(): number {

        const dazed = hasEffect(this.playerData.condition, ConditionEffect.DAZED);
        const dazedImmune = hasEffect(this.playerData.condition, ConditionEffect.DAZED_IMMUNE);

        if (dazed && !dazedImmune) {
            return MIN_ATTACK_FREQ;
        }

        let atkFreq = MIN_ATTACK_FREQ + (this.playerData.dex / 75) * (MAX_ATTACK_FREQ - MIN_ATTACK_FREQ);

        const berserk = hasEffect(this.playerData.condition, ConditionEffect.BERSERK);
        if (berserk) {
            atkFreq *= 1.5;
        }

        return atkFreq;
    }

    /**
     * Sends a packet only if the client is currently connected.
     * @param packet The packet to send.
     */
    private send(packet: Packet): void {
        if (!this.clientSocket.destroyed && this.io) {
            this.io.send(packet);
        } else {
            Logger.log(
                this.alias,
                `Not connected. Cannot send packet ID ${packet.id} (Type ${PacketMap[packet.id]}).`,
                LogLevel.Debug
            );
        }
    }

    private calcHealth(delta: number): void {
        const interval = delta * 0.001;
        const bleeding = hasEffect(this.playerData.condition, ConditionEffect.BLEEDING);
        const sick = hasEffect(this.playerData.condition, ConditionEffect.SICK);
        
        if (!sick && !bleeding) {
            const vitPerSecond = 1 + 0.12 * this.playerData.vit;
            this.hpLog += vitPerSecond * interval;

            const healing = hasEffect(this.playerData.condition, ConditionEffect.HEALING);
            if (healing) {
                this.hpLog += 20 * interval;
            }
        } else if (bleeding) {
            this.hpLog -= 20 * interval;
        }

        const hpToAdd = Math.trunc(this.hpLog);
        const leftovers = this.hpLog - hpToAdd;
        this.hpLog = leftovers;
        this.clientHP += hpToAdd;
        if (this.clientHP > this.playerData.maxHP) {
            this.clientHP = this.playerData.maxHP;
        }
    }

    private checkHealth(time = -1): boolean {
        if (time === -1) {
            time = this.getTime();
        }

        if (!this.safeMap) {
            if (this.autoNexusThreshold === 0) {
                return false;
            }

            const threshold = this.playerData.maxHP * this.autoNexusThreshold;
            const minHp = Math.min(this.clientHP, this.playerData.hp);
            if (minHp < threshold) {
                const autoNexusPercent = (minHp / this.playerData.maxHP) * 100;
                Logger.log(
                    this.alias,
                    `Auto nexused at ${autoNexusPercent.toFixed(1)}%`,
                    LogLevel.Warning
                );
                
                this.connectToNexus();
                return true;
            }
        }
        return false;
    }

    private addHealth(amount: number): void {
        this.clientHP += amount;
        if (this.clientHP >= this.playerData.maxHP) {
            this.clientHP = this.playerData.maxHP;
        }
    }
}
