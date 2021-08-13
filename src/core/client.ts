import EventEmitter from "events";
import { Socket } from "net";
import { PacketIO, WorldPosData, Packet, HelloPacket, PacketMap, InventorySwapPacket, SlotObjectData, MapInfoPacket, CreatePacket, LoadPacket, DeathPacket, UpdatePacket, UpdateAckPacket, ReconnectPacket, GotoPacket, GotoAckPacket, FailurePacket, FailureCode, AoePacket, AoeAckPacket, NewTickPacket, MovePacket, PingPacket, PongPacket, CreateSuccessPacket } from "realmlib";
import { Proxy, Runtime, Account, PlayerData, CharacterInfo, GameId, MoveRecords, getWaitTime, ClientEvent, Logger, LogLevel, delay, Classes, AccountInUseError, createConnection, Server, getHooks } from "..";
import { PacketHook } from "../decorators"
import * as parsers from "../util/parsers";

export class Client extends EventEmitter {

    // Core Modules
    public readonly runtime: Runtime;
    
    // Networking
    public io: PacketIO;
    public proxy: Proxy;
    
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
    private clientSocket: Socket;
    private connected: boolean;
    private connectTime: number;

    private reconnectCooldown: number;
    private blockReconnect: boolean;
    private blockNextUpdateAck: boolean;

    private lastFrameTime: number;
    private frameUpdateTimer: NodeJS.Timer;
    
    constructor(account: Account, runtime: Runtime, server: Server, proxy?: Proxy) {
        super();

        // Core Modules
        this.runtime = runtime;

        // Networking
        this.io = new PacketIO();
        this.io.on("error", this.onPacketIOError.bind(this));
        this.proxy = proxy;

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
        // this.clientSocket;
        this.connected = false;
        this.connectTime = Date.now();

        this.reconnectCooldown = getWaitTime(this.proxy ? this.proxy.host : "");
        this.blockReconnect = false;
        this.blockNextUpdateAck = false;

        this.lastFrameTime = 0;
        // this.frameUpdateTimer;

        // use a set here to eliminate duplicates.
        const requiredHooks = new Set(getHooks().map((hook) => hook.packet));
        for (const type of requiredHooks) {
            this.io.on(type, (data) => {
                this.runtime.libraryManager.callHooks(data as Packet, this);
            });
        }

        this.runtime.emit(ClientEvent.Created, this);

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
        if (this.clientSocket) {
            this.clientSocket.destroy();
            return;
        }
        if (this.frameUpdateTimer) {
            clearInterval(this.frameUpdateTimer);
            this.frameUpdateTimer = undefined;
        }

        if (this.reconnectCooldown > 0) {
            Logger.log(
                this.account.alias,
                `Connecting in ${this.reconnectCooldown / 1000} milliseconds`,
                LogLevel.Debug
            );
            await delay(this.reconnectCooldown);
        }

        try {
            if (this.proxy) {
                Logger.log(this.account.alias, "Establishing proxy connection", LogLevel.Debug);
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
            this.clientSocket.on("close", this.onSocketClose.bind(this));
            this.clientSocket.on("error", this.onSocketError.bind(this));

            // perform the connection logic.
            this.onConnect();
        } catch (err) {
            Logger.log(
                this.account.alias,
                `Error while connecting: ${err.message}`,
                LogLevel.Error
            );
            Logger.log(this.account.alias, err.stack, LogLevel.Debug);
            this.reconnectCooldown = getWaitTime(
                this.proxy ? this.proxy.host : ""
            );
            this.emit(ClientEvent.ConnectError, this, err);
            this.runtime.emit(ClientEvent.ConnectError, this, err);
            this.connect();
        }
    }

    private onConnect(): void {
        Logger.log(
            this.account.alias,
            `Connected to ${this.server.name}!`,
            LogLevel.Debug
        );
        this.connected = true;
        this.emit(ClientEvent.Connected, this);
        this.runtime.emit(ClientEvent.Connected, this);
        this.moveRecords = new MoveRecords();
        this.sendHello();
    }

    private sendHello(): void {
        const helloPacket = new HelloPacket();
        helloPacket.buildVersion = this.runtime.versions.exaltVersion;
        helloPacket.gameId = this.gameId;
        helloPacket.accessToken = this.account.accessToken.token;
        helloPacket.keyTime = this.keyTime;
        helloPacket.key = this.key;
        helloPacket.gameNet = "rotmg";
        helloPacket.playPlatform = "rotmg";
        helloPacket.clientToken = this.account.clientToken;
        helloPacket.platformToken = "8bV53M5ysJdVjU4M97fh2g7BnPXhefnc";
        this.send(helloPacket);
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
                this.account.alias,
                `Not connected. Cannot send packet ID ${packet.id} (Type ${PacketMap[packet.id]}).`,
                LogLevel.Debug
            );
        }
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
            this.emit(ClientEvent.Disconnect, this);
            this.runtime.emit(ClientEvent.Disconnect, this);
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
                this.io = undefined;
                this.clientSocket = undefined;
            });
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

    @PacketHook()
    private onMapInfo(mapInfoPacket: MapInfoPacket): void {

        if (this.needsNewCharacter) {
            // create the character.
            const createPacket = new CreatePacket();
            createPacket.classType = Classes.Wizard;
            createPacket.skinType = 0;
            Logger.log(this.account.alias, "Creating new character", LogLevel.Info);
            this.send(createPacket);
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
            this.send(loadPacket);
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
            this.send(updateAck);
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
        this.send(ack);

        if (gotoPacket.objectId === this.objectId) {
            this.worldPos = gotoPacket.position.clone();
        }
    }

    @PacketHook()
    private onFailurePacket(failurePacket: FailurePacket): void {
        switch (failurePacket.errorId) {
            case FailureCode.IncorrectVersion:
                Logger.log(
                    this.account.alias,
                    "Your Exalt build version is out of date - change the buildVersion in versions.json",
                    LogLevel.Error
                );
                process.exit(0);
                return;
            case FailureCode.InvalidTeleportTarget:
                Logger.log(
                    this.account.alias,
                    "Invalid teleport target",
                    LogLevel.Warning
                );
                return;
            case FailureCode.EmailVerificationNeeded:
                Logger.log(
                    this.account.alias,
                    "Failed to connect: account requires email verification",
                    LogLevel.Error
                );
                return;
            case FailureCode.BadKey:
                Logger.log(
                    this.account.alias,
                    "Failed to connect: invalid reconnect key used",
                    LogLevel.Error
                );
                this.key = [];
                this.gameId = GameId.Nexus;
                this.keyTime = -1;
                return;
            case FailureCode.ServerQueueFull:
                Logger.log(
                    this.account.alias,
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
                    this.account.alias,
                    "No active characters. Creating new character.",
                    LogLevel.Info
                );
                this.needsNewCharacter = true;
                return;
            case "Your IP has been temporarily banned for abuse/hacking on this server [6] [FUB]":
                Logger.log(
                    this.account.alias,
                    `Client ${this.account.alias} is IP banned from this server - reconnecting in 5 minutes`,
                    LogLevel.Warning
                );
                this.reconnectCooldown = 1000 * 60 * 5;
                return;
            case "{\"key\":\"server.realm_full\"}":
                // ignore these messages for now
                return;
        }

        Logger.log(
            this.account.alias,
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
        this.send(aoeAck);
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
        this.send(movePacket);

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
        this.send(pongPacket);
    }


    @PacketHook()
    private onCreateSuccess(createSuccessPacket: CreateSuccessPacket): void {
        Logger.log(this.account.alias, "Connected!", LogLevel.Success);
        this.objectId = createSuccessPacket.objectId;
        this.charInfo.charId = createSuccessPacket.charId;
        this.charInfo.nextCharId = this.charInfo.charId + 1;
        this.lastFrameTime = this.getTime();
        this.runtime.emit(ClientEvent.Ready, this);
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
        this.connected = false;
        this.emit(ClientEvent.Disconnect, this);
        this.runtime.emit(ClientEvent.Disconnect, this);
        this.io.detach();
        this.clientSocket = undefined;

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

    private onSocketError(error: Error): void {
        Logger.log(
            this.account.alias,
            `Received socket error: ${error.message}`,
            LogLevel.Error
        );
        Logger.log(this.account.alias, error.stack, LogLevel.Debug);
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
