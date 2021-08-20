import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { SocksProxy } from "socks";
import { PacketIO, WorldPosData, Packet, HelloPacket, InventorySwapPacket, SlotObjectData, MapInfoPacket, CreatePacket, LoadPacket, DeathPacket, UpdatePacket, UpdateAckPacket, ReconnectPacket, GotoPacket, GotoAckPacket, FailurePacket, FailureCode, AoePacket, AoeAckPacket, NewTickPacket, MovePacket, PingPacket, PongPacket, CreateSuccessPacket, GameId } from "realmlib";
import { Runtime, Account, PlayerData, CharacterInfo, MoveRecords, getWaitTime, ClientEvent, Logger, LogLevel, delay, Classes, AccountInUseError, createConnection, Server, getHooks } from "..";
import { PacketHook } from "../decorators";
import * as parsers from "../util/parsers";

export class Client {

    // Core Modules
    public readonly emitter: TypedEmitter<ClientEvent>;
    public readonly runtime: Runtime;
    
    // Networking
    public packetIO: PacketIO;
    
    // Player Data
    public account: Account;
    public playerData: PlayerData;
    public readonly charInfo: CharacterInfo;
    private needsNewCharacter: boolean;
    public objectId: number;
    public worldPos: WorldPosData;
    private moveRecords: MoveRecords;

    // Map Info
    private key: number[];
    private keyTime: number;
    private gameId: GameId;

    // Client Connection
    public server: Server;
    private nexusServer: Server;
    private connected: boolean;
    private connectTime: number;

    public reconnectCooldown: number;
    public blockReconnect: boolean;
    public blockNextUpdateAck: boolean;

    private lastFrameTime: number;
    private frameUpdateTimer: NodeJS.Timer;
    
    constructor(account: Account, runtime: Runtime, server: Server) {

        // Core Modules
        this.emitter = new EventEmitter();
        this.runtime = runtime;

        // Networking
        this.packetIO = new PacketIO();
        this.packetIO.on("error", this.onPacketIOError.bind(this));

        // Player Data
        this.account = account;
        this.playerData = {} as PlayerData;
        this.playerData.server = server.name;
        this.charInfo = account.charInfo;
        this.objectId = 0;
        this.worldPos = new WorldPosData();
        this.needsNewCharacter = this.charInfo.charId < 1;

        // Map Info
        this.key = [];
        this.keyTime = -1;
        this.gameId = GameId.Nexus;

        // Pathfinding
        this.moveRecords = new MoveRecords();

        // Client Connection
        this.server = Object.assign({}, server);
        this.nexusServer = Object.assign({}, server);
        this.connected = false;
        this.connectTime = Date.now();

        this.reconnectCooldown = getWaitTime(this.account.proxy ? this.account.proxy.host : "");
        this.blockReconnect = false;
        this.blockNextUpdateAck = false;

        this.lastFrameTime = 0;
        // this.frameUpdateTimer;

        // use a set here to eliminate duplicates.
        const requiredHooks = new Set(getHooks().map((hook) => hook.packet));
        for (const type of requiredHooks) {
            this.packetIO.on(type, (data) => {
                this.runtime.libraryManager.callHooks(data as Packet, this);
            });
        }

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
    public connectToServer(server: Server, gameId = this.gameId): void {
        Logger.log(
            this.account.alias,
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
        Logger.log(this.account.alias, "Connecting to the Nexus", LogLevel.Info);
        this.gameId = GameId.Nexus;
        this.server = Object.assign({}, this.nexusServer);
        this.connect();
    }

    /**
     * Connects to `gameId` on the current server
     *  @param gameId The gameId to use upon connecting.
     */
    public changeGameId(gameId: GameId): void {
        Logger.log(this.account.alias, `Changing gameId to ${gameId}`, LogLevel.Info);
        this.gameId = gameId;
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
        helloPacket.gameId = this.gameId;
        helloPacket.accessToken = this.account.accessToken.token;
        helloPacket.keyTime = this.keyTime;
        helloPacket.key = this.key;
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

        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
        }

        this.emitter.emit("Disconnect", this);
        this.runtime.emitter.emit("Disconnect", this);

        this.connected = false;
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

        this.moveRecords = new MoveRecords();

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
        if (deathPacket.accountId !== this.playerData.accountId) {
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
    private onUpdate(updatePacket: UpdatePacket): void {
        if (!this.blockNextUpdateAck) {
            const updateAck = new UpdateAckPacket();
            this.packetIO.send(updateAck);
        } else {
            this.blockNextUpdateAck = false;
        }

        for (const obj of updatePacket.newObjects) {
            if (obj.status.objectId === this.objectId) {
                this.worldPos = obj.status.pos;
                this.playerData = parsers.processObject(obj);
                this.playerData.server = this.server.name;
                continue;
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
        aoeAck.time = this.lastFrameTime;
        aoeAck.position = this.worldPos.clone();
        this.packetIO.send(aoeAck);
    }

    @PacketHook()
    private onNewTick(newTickPacket: NewTickPacket): void {
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
        this.packetIO.send(movePacket);

        for (const status of newTickPacket.statuses) {
            if (status.objectId === this.objectId) {
                this.playerData = parsers.processStatData(status.stats, this.playerData);
                this.playerData.objectId = this.objectId;
                this.playerData.worldPos = this.worldPos;
                this.playerData.server = this.server.name;
                continue;
            }
        }
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
        this.lastFrameTime = this.getTime();
        this.runtime.emitter.emit("Ready", this);
        this.frameUpdateTimer = setInterval(this.onFrame.bind(this), 1000 / 30);
    }

    private onFrame() {
        const time = this.getTime();

        if (this.worldPos) {
            this.moveRecords.addRecord(time, this.worldPos.x, this.worldPos.y);
        }
        
        this.lastFrameTime = time;
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

        if (!this.blockReconnect) {
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
