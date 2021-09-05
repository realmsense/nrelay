import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { PacketIO, WorldPosData, HelloPacket, InventorySwapPacket, SlotObjectData, MapInfoPacket, CreatePacket, LoadPacket, DeathPacket, UpdatePacket, UpdateAckPacket, ReconnectPacket, GotoPacket, GotoAckPacket, FailurePacket, FailureCode, AoePacket, AoeAckPacket, NewTickPacket, MovePacket, PingPacket, PongPacket, CreateSuccessPacket, GameId, ConditionEffect, Point } from "realmlib";
import { Runtime, Account, CharacterInfo, MoveRecords, getWaitTime, ClientEvent, Logger, LogLevel, delay, Classes, AccountInUseError, createConnection, Server } from "..";
import { PacketHook } from "../decorators";
import { Player } from "../models/entities";
import { EntityTracker, MapPlugin, PathfindingPlugin } from "../plugins";

export class Client extends Player {

    // Core Modules
    public readonly emitter: TypedEmitter<ClientEvent>;
    public readonly runtime: Runtime;

    // Networking
    public packetIO: PacketIO;

    // Player Data
    public account: Account;
    public readonly charInfo: CharacterInfo;
    private needsNewCharacter: boolean;
    public objectId: number;

    public tileSpeed: number;
    public worldPos: WorldPosData;

    // Plugins
    public readonly map: MapPlugin;
    public readonly pathfinding: PathfindingPlugin;
    public readonly entityTracker: EntityTracker;

    // Client Connection
    public server: Server;
    private nexusServer: Server;
    private connected: boolean;
    private connectTime: number;

    public reconnectCooldown: number;
    public blockNextReconnect: boolean;
    public blockNextUpdateAck: boolean;

    constructor(account: Account, runtime: Runtime, server: Server) {
        super();

        // Core Modules
        this.emitter = new EventEmitter();
        this.runtime = runtime;

        // Networking
        this.packetIO = new PacketIO();
        this.packetIO.on("error", this.onPacketIOError.bind(this));

        // Player Data
        this.account = account;
        this.charInfo = account.charInfo;
        this.objectId = 0;
        this.needsNewCharacter = this.charInfo.charId < 1;

        this.tileSpeed = 1.0;
        this.worldPos = new WorldPosData();

        // Plugins
        this.map = new MapPlugin(this);
        this.entityTracker = new EntityTracker(this);
        this.pathfinding = new PathfindingPlugin(this);

        // Client Connection
        this.server = Object.assign({}, server);
        this.nexusServer = Object.assign({}, server);
        this.connected = false;
        this.connectTime = Date.now();

        this.reconnectCooldown = getWaitTime(this.account.proxy ? this.account.proxy.host : "");
        this.blockNextReconnect = false;
        this.blockNextUpdateAck = false;

        this.runtime.pluginManager.hookClient(this);
        this.runtime.pluginManager.hookInstance(this, this);

        this.runtime.emitter.emit("Created", this);

        if (account.autoConnect) {
            Logger.log(
                this.account.alias,
                `Starting connection to ${server.name}`,
                LogLevel.Info,
            );
            this.connect();
        }
    }

    /**
     * Connects the bot to the `server`.
     * @param server The server to connect to.
     * @param gameId An optional game id to use when connecting. Defaults to the current game id.
     */
    public connectToServer(server: Server, gameId = this.map.gameId): void {
        Logger.log(
            this.account.alias,
            `Switching server to ${server.name}`,
            LogLevel.Info
        );
        this.server = Object.assign({}, server);
        this.nexusServer = Object.assign({}, server);
        this.map.gameId = gameId;
        this.connect();
    }

    /**
     * Connects to the Nexus.
     */
    public connectToNexus(): void {
        Logger.log(this.account.alias, "Connecting to the Nexus", LogLevel.Info);
        this.map.gameId = GameId.Nexus;
        this.server = Object.assign({}, this.nexusServer);
        this.connect();
    }

    /**
     * Connects to `gameId` on the current server
     *  @param gameId The gameId to use upon connecting.
     */
    public changeGameId(gameId: GameId): void {
        Logger.log(this.account.alias, `Changing gameId to ${gameId}`, LogLevel.Info);
        this.map.gameId = gameId;
        this.connect();
    }

    private async connect(): Promise<void> {

        if (this.connected) {
            this.disconnect();
        }

        if (this.reconnectCooldown > 0) {
            Logger.log(
                this.account.alias,
                `Delaying connection to ${this.server.name} by ${this.reconnectCooldown / 1000} seconds`,
                LogLevel.Debug
            );
            await delay(this.reconnectCooldown);
        }

        try {
            if (this.account.proxy) {
                Logger.log(this.account.alias, "Establishing proxy connection", LogLevel.Debug);
            }
            const socket = await createConnection(
                this.server.address,
                2050,
                this.account.proxy
            );

            this.packetIO.attach(socket);
            this.packetIO.socket.on("close", this.onSocketClose.bind(this));
            this.packetIO.socket.on("error", this.onSocketError.bind(this));

            this.onConnect();
        } catch (err) {
            Logger.log(
                this.account.alias,
                `Error while connecting: ${err.message}`,
                LogLevel.Error
            );
            Logger.log(this.account.alias, err.stack, LogLevel.Debug);
            this.reconnectCooldown = getWaitTime(
                this.account.proxy ? this.account.proxy.host : ""
            );
            this.emitter.emit("ConnectError", this, err);
            this.runtime.emitter.emit("ConnectError", this, err);
            this.connect();
        }
    }

    private onConnect(): void {
        Logger.log(
            this.account.alias,
            `Connected to ${this.server.name}, sending HelloPacket`,
            LogLevel.Debug
        );

        this.connected = true;
        this.emitter.emit("Connected", this);
        this.runtime.emitter.emit("Connected", this);

        const helloPacket = new HelloPacket();
        helloPacket.exaltVer = this.runtime.versions.exaltVersion;
        helloPacket.gameId = this.map.gameId;
        helloPacket.accessToken = this.account.accessToken.token;
        helloPacket.keyTime = this.map.keyTime;
        helloPacket.key = this.map.key;
        helloPacket.gameNet = "rotmg";
        helloPacket.playPlatform = "rotmg";
        helloPacket.clientToken = this.account.clientToken;
        helloPacket.platformToken = this.runtime.versions.platformToken;
        this.packetIO.send(helloPacket);
    }

    public disconnect(): void {
        if (this.packetIO.socket) {
            this.packetIO.socket.destroy();
        }

        this.packetIO.detach();

        this.emitter.emit("Disconnect", this);
        this.runtime.emitter.emit("Disconnect", this);

        this.connected = false;
    }

    public swapToInventory(objectType: number, fromSlot: number, toSlot: number, container: number): void {
        const packet = new InventorySwapPacket();
        packet.position = this.worldPos;
        packet.time = this.getTime();

        const vaultSlot = new SlotObjectData();
        vaultSlot.objectId = container;
        vaultSlot.slotId = fromSlot;
        vaultSlot.objectType = objectType;
        packet.slotObject1 = vaultSlot;

        const inventory = new SlotObjectData();
        inventory.objectId = this.objectId;
        if (this.inventory[toSlot] === -1) {
            inventory.slotId = toSlot;
            inventory.objectType = -1;

            packet.slotObject2 = inventory;
            this.packetIO.send(packet);
        } else {
            Logger.log(
                "Inventory Swapping",
                "Failed to swap as the inventory slot is full",
                LogLevel.Debug
            );
        }
    }

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {

        if (this.needsNewCharacter) {
            // create the character.
            const createPacket = new CreatePacket();
            createPacket.classType = Classes.Wizard;
            createPacket.skinType = 0;
            Logger.log(this.account.alias, "Creating new character", LogLevel.Info);
            this.packetIO.send(createPacket);
            this.needsNewCharacter = false;
            // update the char info cache.
            this.charInfo.charId = this.charInfo.nextCharId;
            this.charInfo.nextCharId += 1;
            this.runtime.accountService.updateCharInfoCache(
                this.account.guid,
                this.charInfo
            );
        } else {
            const loadPacket = new LoadPacket();
            loadPacket.charId = this.charInfo.charId;
            Logger.log(
                this.account.alias,
                `Connecting to ${mapInfoPacket.name}`,
                LogLevel.Info
            );
            this.packetIO.send(loadPacket);
        }
    }

    @PacketHook()
    private onDeath(deathPacket: DeathPacket): void {
        // check if it was our client that died
        if (deathPacket.accountId != this.accountID) {
            return;
        }

        Logger.log(
            this.account.alias,
            `The character ${deathPacket.charId} has died`,
            LogLevel.Warning
        );

        // update the char info.
        this.charInfo.charId = this.charInfo.nextCharId;
        this.charInfo.nextCharId++;
        this.needsNewCharacter = true;

        // update the char info cache.
        this.runtime.accountService.updateCharInfoCache(
            this.account.guid,
            this.charInfo
        );

        Logger.log(this.account.alias, "Connecting to the nexus..", LogLevel.Info);
        this.connectToNexus();
    }

    @PacketHook()
    private onNewTick(newTickPacket: NewTickPacket): void {
        const tileXML = this.map.getTile(this.worldPos);
        if (tileXML) {
            this.tileSpeed = tileXML.speed;
        }
    }

    @PacketHook()
    private onUpdate(updatePacket: UpdatePacket): void {
        if (!this.blockNextUpdateAck) {
            const updateAck = new UpdateAckPacket();
            this.packetIO.send(updateAck);
        } else {
            this.blockNextUpdateAck = false;
        }

        for (const obj of updatePacket.newObjects) {
            if (obj.status.objectId == this.objectId) {
                this.worldPos = obj.status.pos;
                this.parseStatus(obj.status);
                continue;
            }
        }
    }

    @PacketHook()
    private onReconnectPacket(reconnectPacket: ReconnectPacket): void {
        // check for reconnect blocking
        if (this.blockNextReconnect) {
            Logger.log(
                "Reconnect",
                `Blocked reconnect packet for ${reconnectPacket.name}`,
                LogLevel.Debug
            );
            this.blockNextReconnect = false;
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

        this.map.gameId = reconnectPacket.gameId;
        this.map.key = reconnectPacket.key;
        this.map.keyTime = reconnectPacket.keyTime;
        this.connect();
    }

    @PacketHook()
    private onGotoPacket(gotoPacket: GotoPacket): void {
        const ack = new GotoAckPacket();
        ack.time = this.getTime();
        this.packetIO.send(ack);

        if (gotoPacket.objectId === this.objectId) {
            this.worldPos = gotoPacket.position.clone();
        }
    }

    @PacketHook()
    private async onFailurePacket(failurePacket: FailurePacket): Promise<void> {
        switch (failurePacket.errorId) {

            case FailureCode.IncorrectVersion:
                Logger.log(
                    this.account.alias,
                    "Your Exalt build version is out of date - change the buildVersion in versions.json",
                    LogLevel.Error
                );
                process.exit(0);
                return;

            case FailureCode.UnverifiedEmail:
                Logger.log(
                    this.account.alias,
                    "Failed to connect: account requires email verification",
                    LogLevel.Error
                );
                return;

            case FailureCode.InvalidTeleportTarget:
                Logger.log(
                    this.account.alias,
                    "Invalid teleport target",
                    LogLevel.Warning
                );
                return;

            case FailureCode.TeleportBlocked:
                Logger.log(
                    this.account.alias,
                    "Teleport blocked",
                    LogLevel.Warning
                );
                return;

            case FailureCode.BadKey:
                Logger.log(
                    this.account.alias,
                    "Failed to connect: invalid reconnect key used",
                    LogLevel.Error
                );
                this.connectToNexus();
                return;

            case FailureCode.WrongServer:
                Logger.log(
                    this.account.alias,
                    "Failed to connect: wrong server",
                    LogLevel.Error
                );
                this.connectToNexus();
                return;

            case FailureCode.ServerFull:
                // TODO: add server queue functionality
                Logger.log(
                    this.account.alias,
                    `Server is full - waiting 5 seconds: ${failurePacket.message}`,
                    LogLevel.Warning
                );
                this.reconnectCooldown = 5000;
                return;
        }

        switch (failurePacket.message) {
            case "Character is dead":
                this.fixCharInfoCache();
                return;
            case "Character not found":
                Logger.log(
                    this.account.alias,
                    "No active characters. Creating new character.",
                    LogLevel.Info
                );
                this.needsNewCharacter = true;
                return;
            case "Your IP has been temporarily banned for abuse/hacking on this server":
                Logger.log(
                    this.account.alias,
                    `Client ${this.account.alias} is IP banned from this server - reconnecting in 5 minutes`,
                    LogLevel.Warning
                );
                this.reconnectCooldown = 1000 * 60 * 5;
                return;
            case "Access token is invalid": {
                // TODO: clean up this method
                const valid = await this.runtime.accountService.verifyAccessToken(this.account);
                return;
            }
        }

        Logger.log(
            this.account.alias,
            `Received failure ${failurePacket.errorId} (${FailureCode[failurePacket.errorId]}): "${failurePacket.message}"`,
            LogLevel.Error
        );

        if (AccountInUseError.regex.test(failurePacket.message)) {
            const timeout: any = AccountInUseError.regex.exec(failurePacket.message)[1];
            if (!isNaN(timeout)) {
                this.reconnectCooldown = parseInt(timeout, 10) * 1000;
            }
        }
    }

    @PacketHook()
    private onAoe(aoePacket: AoePacket): void {
        const aoeAck = new AoeAckPacket();
        aoeAck.time = this.getTime();
        aoeAck.position = this.worldPos.clone();
        this.packetIO.send(aoeAck);
    }

    @PacketHook()
    private onPing(pingPacket: PingPacket): void {
        const pongPacket = new PongPacket();
        pongPacket.serial = pingPacket.serial;
        pongPacket.time = this.getTime();
        this.packetIO.send(pongPacket);
    }


    @PacketHook()
    private onCreateSuccess(createSuccessPacket: CreateSuccessPacket): void {
        Logger.log(this.account.alias, "Connected!", LogLevel.Success);
        this.objectId = createSuccessPacket.objectId;
        this.charInfo.charId = createSuccessPacket.charId;
        this.charInfo.nextCharId = this.charInfo.charId + 1;
        this.runtime.emitter.emit("Ready", this);
    }

    /**
     * Fixes the character cache after a dead character has been loaded.
     */
    private fixCharInfoCache(): void {
        Logger.log(
            this.account.alias,
            "Tried to load a dead character. Fixing character info cache...",
            LogLevel.Debug
        );

        // update the char info
        this.charInfo.charId = this.charInfo.nextCharId;
        this.charInfo.nextCharId++;
        this.needsNewCharacter = true;

        // update the cache
        this.runtime.accountService.updateCharInfoCache(
            this.account.guid,
            this.charInfo
        );
    }

    /**
     * Returns how long the client has been connected for, in milliseconds.
     */
    public getTime(): number {
        return Date.now() - this.connectTime;
    }

    /**
     * Il2Cpp: `JFNHHLNJJKP_ICBKOEJBGKE`
     * @returns The move speed of the client in tiles per second.
     */
    public getMoveSpeed(): number {

        const MIN_MOVE_SPEED = 0.004;
        const MAX_MOVE_SPEED = 0.0096;

        if (this.hasEffect(ConditionEffect.SLOWED)) {
            return MIN_MOVE_SPEED * this.tileSpeed;
        }

        let speed = ((this.speed / 75) * (MAX_MOVE_SPEED - MIN_MOVE_SPEED)) + MIN_MOVE_SPEED;

        if (this.hasEffect(ConditionEffect.SPEEDY | ConditionEffect.NINJA_SPEEDY)) {
            speed *= 1.5;
        }

        return speed *= this.tileSpeed;
    }

    private onSocketClose(): void {
        Logger.log(
            this.account.alias,
            `The connection to ${this.nexusServer.name} was closed`,
            LogLevel.Warning
        );

        this.disconnect();

        if (this.reconnectCooldown <= 0) {
            this.reconnectCooldown = getWaitTime(
                this.account.proxy ? this.account.proxy.host : ""
            );
        }

        if (!this.blockNextReconnect) {
            this.connect();
        }
    }

    private onSocketError(error: Error): void {
        Logger.log(
            this.account.alias,
            `Received socket error: ${error.message}`,
            LogLevel.Error
        );

        Logger.log(this.account.alias, error.stack, LogLevel.Debug);
        this.disconnect();
    }

    private onPacketIOError(error: Error): void {
        Logger.log(
            this.account.alias,
            `Received PacketIO error: ${error.message}`,
            LogLevel.Error
        );
        Logger.log(this.account.alias, error.stack, LogLevel.Debug);
    }
}
