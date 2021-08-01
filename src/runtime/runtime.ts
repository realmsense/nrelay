import { EventEmitter } from "events";
import { createWriteStream, WriteStream } from "fs";
import { isIP } from "net";
import { PacketMap } from "realmlib";
import { Client, LibraryManager, ResourceManager } from "../core";
import { ProxyPool } from "../core/proxy-pool";
import { Account, AccountAlreadyManagedError, NoProxiesAvailableError, Proxy, RuntimeError } from "../models";
import { VerifyAccessTokenResponse } from "../models/access-token";
import { RunOptions } from "../models/run-options";
import { AccountService, DefaultLogger, FileLogger, Logger, LogLevel } from "../services";
import { delay } from "../util/misc-util";
import { Environment } from "./environment";
import { Versions } from "./versions";

const MAX_RETRIES = 10;

/**
 * An object which can be provided to the runtime when running.
 */
interface Arguments {
    [argName: string]: any;
}

/**
 * An account which was initially added, but failed for some reason.
 */
interface FailedAccount {
    /**
     * The account which failed to load.
     */
    account: Account;
    /**
     * Whether the account should try to load again.
     */
    retry: boolean;
    /**
     * The number of times this account has tried to be loaded.
     */
    retryCount: number;
    /**
     * The number of seconds to wait before trying to load this account again.
     */
    timeout: number;
}

/**
 * The runtime manages clients, resources, plugins and any other services
 * which are used by an nrelay project.
 */
export class Runtime extends EventEmitter {

    public readonly env: Environment;
    public readonly accountService: AccountService;
    public readonly resources: ResourceManager;
    public readonly libraryManager: LibraryManager;
    public readonly proxyPool: ProxyPool;

    public buildVersion: string;
    public platformToken: string;
    public args: Arguments;

    private logStream: WriteStream;
    private readonly clients: Map<string, Client>;

    constructor() {
        super();
        this.env = new Environment(process.cwd());
        this.accountService = new AccountService(this.env);
        this.resources = new ResourceManager(this.env);
        this.libraryManager = new LibraryManager(this);
        this.proxyPool = new ProxyPool(this.env);
        this.clients = new Map();
    }

    public static async start(options: RunOptions): Promise<Runtime> {
        
        const runtime = new Runtime();

        // Set default value if option was not specified
        options ??= {};
        options.update ??= false;
        options.forceUpdate ??= false;
        options.debug ??= false;
        options.plugins ??= true;
        options.pluginPath ??= "dist/plugins";
        options.logFile ??= true;

        // Setup Logging
        const logLevel = options.debug ? LogLevel.Debug : LogLevel.Info;
        Logger.addLogger(new DefaultLogger(logLevel));

        if (options.logFile) {
            Logger.log("Runtime", "Creating a log file.", LogLevel.Info);
            const writeStream = createWriteStream(runtime.env.pathTo("src", "nrelay", "nrelay-log.log"));
            Logger.addLogger(new FileLogger(writeStream));
        }

        // Load version info
        const versions = runtime.env.readJSON<Versions>("src", "nrelay", "versions.json");
        if (!versions) {
            Logger.log("Runtime", "Cannot load versions.json", LogLevel.Error);
            process.exit(1);
        }

        runtime.buildVersion = versions.buildVersion;
        runtime.platformToken = versions.clientToken;

        // Update resources if necessary
        if (options.update || options.forceUpdate) {
            await runtime.resources.updateResources(versions.buildHash, options.forceUpdate);
        }

        // Load Resources
        try {
            await runtime.resources.loadAllResources();
        } catch (error) {
            Logger.log("Runtime", "Error while loading resources.", LogLevel.Error);
            Logger.log("Runtime", error.message, LogLevel.Error);
            process.exit(1);
        }

        // Load packets
        const size = Object.keys(PacketMap).length / 2;
        Logger.log("Runtime", `Mapped ${size} packet ids`, LogLevel.Info);

        // Load client hooks / plugins
        runtime.libraryManager.loadClientHooks();
        if (options.plugins) {
            const pluginsPath = options.pluginPath ?? "dist/plugins";
            Logger.log("Runtime", `Loading plugins from "${pluginsPath}"`, LogLevel.Debug);
            runtime.libraryManager.loadPlugins(pluginsPath);
        } else {
            Logger.log("Runtime", "Plugin loading disabled", LogLevel.Info);
        }

        // Load proxies
        runtime.proxyPool.loadProxies();

        // Load accounts
        const accounts = runtime.env.readJSON<Account[]>("src", "nrelay", "accounts.json");
        if (!accounts) {
            Logger.log("Runtime", "Failed to read account list.", LogLevel.Error);
            process.exit(1);
        }

        const failures: FailedAccount[] = [];
        for (const account of accounts) {
            try {
                await runtime.addClient(account);
            } catch (err) {
                const error = err as RuntimeError;

                const failure: FailedAccount = {
                    account,
                    retryCount: 1,
                    timeout: 1,
                    retry: true
                };

                // use a custom timeout if the error has one (e.g. AccountInUseError)
                const timeout = error.timeout;
                if (timeout) {
                    failure.timeout = timeout;
                }

                // if the error specifically specified the failure should not retry. (e.g. NoProxiesAvailableError)
                const retry = error.retry !== false;
                if (retry) {
                    failures.push(failure);
                }

                Logger.log("Runtime", `Error adding account "${account.alias}": ${error.message}. ${retry ? "" : "Not retrying."}`, LogLevel.Error);
            }
        }

        // try to load the failed accounts.
        for (const failure of failures) {
            // perform the work in a promise so it doesn't block.
            // eslint-disable-next-line no-async-promise-executor
            new Promise<void>(async (resolve, reject) => {
                while (failure.retryCount <= MAX_RETRIES && failure.retry) {
                    Logger.log(
                        "Runtime",
                        `Retrying "${failure.account.alias}" in ${failure.timeout} seconds. (${failure.retryCount}/10)`,
                        LogLevel.Info,
                    );

                    // wait for the timeout then try to add the client.
                    await delay(failure.timeout * 1000);

                    try {
                        await runtime.addClient(failure.account);
                        resolve();
                    } catch (err) {
                        const error = err as RuntimeError;
                        const timeout = error.timeout;

                        // increase the timeout on a logarithmic scale
                        if (timeout === undefined) {
                            Math.floor(Math.log10(1 + failure.retryCount) / 2 * 100);
                        }

                        // if the error specifically specified the failure should not retry.
                        // e.g. NoProxiesAvailableError
                        const retry = error.retry !== false;
                        if (!retry) {
                            failure.retry = false;
                        }

                        failure.retryCount++;
                        Logger.log("Runtime", `Error adding account "${failure.account.alias}": ${error.message} ${retry ? "" : "Not retrying."}`, LogLevel.Error);
                    }
                }
                reject();
            }).catch(() => {
                Logger.log(
                    "Runtime",
                    `Failed to load "${failure.account.alias}" after ${MAX_RETRIES} retries. Not retrying.`,
                    LogLevel.Error,
                );
            });
        }

        return runtime;
    }

    /**
     * Creates a new client which uses the provided account.
     * @param account The account to login to.
     * @param censorAliasGuid Whether the account's fallback alias (it's guid) should be censored
     */
    public async addClient(account: Account): Promise<Client> {

        // make sure it's not already part of this runtime.
        if (this.clients.has(account.guid)) {
            return Promise.reject(new AccountAlreadyManagedError());
        }

        // Set default values if option wasn't specified in accounts.json
        account.alias = account.alias || account.guid;
        account.serverPref = account.serverPref || "";
        account.autoConnect = account.autoConnect !== false;
        account.usesProxy = account.usesProxy || false;
        account.pathfinder = account.pathfinder || false;

        Logger.log("Runtime", `Loading ${account.alias}...`);

        let proxy: Proxy;
        if (account.usesProxy && (proxy = this.proxyPool.getNextAvailableProxy()) == null) {
            return Promise.reject(new NoProxiesAvailableError());
        }

        const clientToken = this.accountService.getClientToken(account.guid, account.password);
        const accessToken = await this.accountService.getAccessToken(account.guid, account.password, clientToken, true, proxy);
        const tokenResponse = await this.accountService.verifyAccessTokenClient(accessToken, clientToken, proxy);

        if (tokenResponse != VerifyAccessTokenResponse.Success) {
            return Promise.reject(tokenResponse);
        }

        const charInfo = await this.accountService.getCharacterInfo(account.guid, accessToken, proxy);
        account.charInfo = charInfo;

        const serverList = await this.accountService.getServerList(accessToken);
        const serverKeys = Object.keys(serverList);
        if (serverKeys.length === 0) {
            throw new Error("Server list is empty");
        }

        let server = serverList[account.serverPref];
        if (!server) {
            if (isIP(account.serverPref)) {
                server = {
                    address: account.serverPref,
                    name: `IP: ${account.serverPref}`,
                };
            } else {
                // if an invalid server was specified, choose a random one instead
                const random = Math.floor(Math.random() * serverKeys.length);
                server = serverList[serverKeys[random]];
                Logger.log(
                    account.alias,
                    `Preferred server not found. Using ${server.name} instead.`,
                    LogLevel.Warning
                );
            }
        }

        Logger.log("Runtime", `Loaded ${account.alias}!`, LogLevel.Success);
        const client = new Client(this, server, account, accessToken, clientToken, proxy);
        this.clients.set(client.guid, client);
        return client;
    }

    /**
     * Removes the client with the given `guid` from this runtime.
     * @param guid The guid of the client to remove.
     */
    public removeClient(guid: string): void {
        // make sure the client is actually in this runtime.
        if (this.clients.has(guid)) {
            const alias = this.clients.get(guid).alias;
            this.clients.get(guid).destroy();
            this.clients.delete(guid);
            Logger.log("Runtime", `Removed ${alias}!`, LogLevel.Success);
        } else {
            Logger.log(
                "Runtime",
                `The client ${guid} is not part of this runtime.`,
                LogLevel.Warning,
            );
        }
    }

    /**
     * Gets a copy of the clients in this runtime.
     * Modifying this list will not affect the runtime.
     */
    public getClients(): Client[] {
        return [...this.clients.values()];
    }
}
