import fs from "fs";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { Environment, VersionConfig, FILE_PATH } from ".";
import { AccountService, ResourceManager, PluginManager, ProxyPool, Client, RunOptions, LogLevel, Logger, ConsoleLogger, FileLogger, Account, delay, ClientEvent, ServerList, LanguageString, Proxy, getTimestamp } from "..";

/**
 * The runtime manages clients, resources, plugins and any other services
 * which are used by an nrelay project.
 */
export class Runtime {

    public readonly emitter: TypedEmitter<ClientEvent>;
    public readonly env: Environment;
    public readonly accountService: AccountService;
    public readonly resources: ResourceManager;
    public readonly pluginManager: PluginManager;
    public readonly proxyPool: ProxyPool;
    public readonly serverList: ServerList;
    
    public versions: VersionConfig;
    public languageStrings: LanguageString[];

    /** Fallback proxy */
    public readonly proxy: Proxy | undefined;

    private readonly clients: Map<string, Client>;

    constructor() {
        this.emitter        = new EventEmitter();
        this.env            = new Environment();
        this.accountService = new AccountService(this.env);
        this.resources      = new ResourceManager(this.env);
        this.pluginManager  = new PluginManager(this);
        this.proxyPool      = new ProxyPool(this.env);
        this.serverList     = new ServerList(this);
        this.clients        = new Map();
        
        this.proxy          = this.proxyPool.getRandomProxy();
    }

    public static async start(options: RunOptions): Promise<Runtime> {

        const runtime = new Runtime();

        // Set default value if option was not specified
        options            ??= {};
        options.debug      ??= false;
        options.plugins    ??= true;
        options.pluginPath ??= "dist/plugins";
        options.logFile    ??= true;

        // Setup Logging
        const logLevel = options.debug ? LogLevel.Debug : LogLevel.Info;
        Logger.addLogger(new ConsoleLogger(logLevel));

        if (options.logFile) {
            Logger.log("Runtime", "Creating a log file.", LogLevel.Info);
            const logFile = runtime.env.writeFile("", [...FILE_PATH.LOG_PATH, `nrelay-${getTimestamp()}.log`]); // clear file and ensure it exists
            const writeStream = fs.createWriteStream(logFile);
            Logger.addLogger(new FileLogger(writeStream));
        }

        Logger.printHeader();

        // Load version info
        let versionConfig = runtime.env.readJSON<VersionConfig>(FILE_PATH.VERSIONS);
        if (!versionConfig) {

            // No use of trying a blank config if we have no updater to use it with.
            if (!options.update) {
                Logger.log("Runtime", "Cannot load versions.json and no updater config was provided, aborting!", LogLevel.Error);
                process.exit(1);
            }
            
            Logger.log("Runtime", "Cannot load versions.json, using blank config.", LogLevel.Warning);
            versionConfig = { buildHash: "", exaltVersion: "", platformToken: "8bV53M5ysJdVjU4M97fh2g7BnPXhefnc" };
            options.update.force = true;
        }

        // Update resources
        if (options.update && (options.update.enabled || options.update.force)) {
            await runtime.resources.updateResources(versionConfig, options.update);
        }

        await runtime.accountService.checkMaintanence(runtime.proxy);
        runtime.languageStrings = await runtime.accountService.getLanguageStrings(runtime.proxy);

        runtime.versions = versionConfig;

        // Load Resources
        await runtime.resources.loadTiles();
        await runtime.resources.loadObjects();

        // Load client hooks / plugins
        if (options.plugins) {
            const pluginsPath = options.pluginPath ?? "dist/plugins";
            await runtime.pluginManager.loadPlugins(pluginsPath);
        } else {
            Logger.log("Runtime", "Plugin loading disabled", LogLevel.Info);
        }

        // Load clients
        const accounts = runtime.env.readJSON<Account[]>(FILE_PATH.ACCOUNTS, true);
        Logger.log("Runtime", `Loading ${accounts.length} clients.`, LogLevel.Info);

        const MAX_ACCOUNT_RETRIES = 5;
        for (const account of accounts) {

            // Set default values if unspecified
            account.alias       ??= account.guid;
            account.autoConnect ??= true;
            account.serverPref  ??= runtime.serverList.getRandomServer().name;
            account.usesProxy   ??= false;
            account.retry       ??= true;
            account.retryCount  ??= 0;
            account.timeout     ??= 0;

            // Asynchronously load accounts, wrapped in a Promise in order not to block
            // eslint-disable-next-line no-async-promise-executor
            new Promise<void>(async (resolve, reject) => {
                while (account.retry && account.retryCount <= MAX_ACCOUNT_RETRIES) {
                    const client = await runtime.addClient(account);
                    if (client) {
                        resolve();
                        break;
                    }

                    if (!account.retry) {
                        Logger.log("Runtime", `Failed adding "${account.alias}", not retrying!`, LogLevel.Error);
                        runtime.proxyPool.unassignProxy(account, account.serverPref);
                        reject();
                        break;
                    }

                    account.retryCount++;
                    Logger.log(
                        "Runtime",
                        `Retrying "${account.alias}" in ${account.timeout} seconds. (${account.retryCount}/${MAX_ACCOUNT_RETRIES})`,
                        LogLevel.Message
                    );
                    await delay(account.timeout * 1000);
                }
            });
        }

        return runtime;
    }

    /**
     * Creates a new client which uses the provided account.
     * @param account The account to login to.
     */
    public async addClient(account: Account): Promise<Client | null> {
        if (!account.guid || !account.password) {
            Logger.log("Runtime", "Error loading the following account, a guid and password is required!", LogLevel.Error);
            Logger.log("Runtime", JSON.stringify(account, undefined, 4), LogLevel.Error);
            account.retry = false;
            return null;
        }

        if (this.clients.has(account.guid)) {
            Logger.log("Runtime", `Error loading account "${account.guid}", account is already loaded! (Duplicate entry in accounts.json)`, LogLevel.Error);
            account.retry = false;
            return null;
        }

        // Load the serverList
        if (!this.serverList.loaded) {
            // Temporarily set this account's proxy to the runtime's. Incase the server list isn't cached and we need to make an appspot request.
            account.proxy = this.proxy; 
            
            const serversLoaded = await this.serverList.loadServers(true, account);
            if (!serversLoaded) {
                Logger.log("Runtime", `Failed to fetch server list with account "${account.guid}", retrying...`, LogLevel.Error);
                account.proxy = undefined;
                return null;
            }

            account.proxy = undefined;
        }

        // Set server preference
        let server = this.serverList.servers.find((value) => account.serverPref == value.name || account.serverPref == value.address);
        if (!server) {
            server = this.serverList.getRandomServer();
            account.serverPref = server.name;
            Logger.log("Runtime", `${account.alias}: Preferred server not found. Using ${server.name} instead.`, LogLevel.Warning);
        }

        // Set proxy
        if (account.usesProxy && !account.proxy) {
            const success = this.proxyPool.assignProxy(account, server.name);
            if (!success) {
                Logger.log("Runtime", `Error loading account "${account.guid}", account requires a proxy but none are available! Skipping account.`, LogLevel.Error);
                account.retry = false;
                return null;
            }
        }

        // Verify tokens
        const validTokens = await this.accountService.verifyTokens(account);
        if (!validTokens) {
            Logger.log("Runtime", `Error loading account "${account.guid}", access token failed to validate! Skipping account.`, LogLevel.Error);
            account.retry = false;
            return null;
        }

        account.charInfo = await this.accountService.getCharacterInfo(account);

        Logger.log("Runtime", `Loaded "${account.alias}"`, LogLevel.Success);
        const client = new Client(account, this, server);
        this.clients.set(client.account.guid, client);
        return client;
    }

    /**
     * Removes the client with the given `guid` from this runtime.
     * @param guid The guid of the client to remove.
     */
    public removeClient(guid: string): void {
        const client = this.clients.get(guid);
        if (!client) {
            Logger.log(
                "Runtime",
                `Failed to remove client "${guid}" as it is not apart of this runtime.`,
                LogLevel.Warning,
            );
            return;
        }

        client.disconnect();
        this.proxyPool.unassignProxy(client.account, client.account.serverPref);
        this.clients.delete(guid);
        Logger.log("Runtime", `Removed ${guid} (${client.account.alias}) from the runtime.`, LogLevel.Success);
    }

    /**
     * Gets a copy of the clients in this runtime.
     * Modifying this list will not affect the runtime.
     */
    public getClients(): Client[] {
        return [...this.clients.values()];
    }
}
