import fs from "fs";
import EventEmitter from "events";
import { PacketMap } from "realmlib";
import { Environment, VersionConfig, FILE_PATH } from ".";
import { AccountService, ResourceManager, LibraryManager, ProxyPool, Client, RunOptions, LogLevel, Logger, ConsoleLogger, FileLogger, Account, delay, NoProxiesAvailableError } from "..";
import { SocksProxy } from "socks";

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
    public versions: VersionConfig;

    private logStream: fs.WriteStream;
    private readonly clients: Map<string, Client>;

    constructor() {
        super();
        this.env = new Environment();
        this.accountService = new AccountService(this.env);
        this.resources = new ResourceManager(this.env);
        this.libraryManager = new LibraryManager(this);
        this.proxyPool = new ProxyPool(this.env);
        this.clients = new Map();
    }

    public static async start(options: RunOptions): Promise<Runtime> {

        const runtime = new Runtime();

        // Set default value if option was not specified
        options             ??= {};
        options.update      ??= {enabled: false} as never;
        options.debug       ??= false;
        options.plugins     ??= true;
        options.pluginPath  ??= "dist/plugins";
        options.logFile     ??= true;

        // Setup Logging
        const logLevel = options.debug ? LogLevel.Debug : LogLevel.Info;
        Logger.addLogger(new ConsoleLogger(logLevel));

        if (options.logFile) {
            Logger.log("Runtime", "Creating a log file.", LogLevel.Info);
            const logFile = runtime.env.writeFile("", FILE_PATH.LOG_FILE); // clear file and ensure it exists
            const writeStream = fs.createWriteStream(logFile);
            Logger.addLogger(new FileLogger(writeStream));
        }

        // Load/Update resources
        if (options.update.enabled || options.update.force) {
            await runtime.resources.updateResources(options.update);
        }

        // Load version info
        const versions = runtime.env.readJSON<VersionConfig>(FILE_PATH.VERSIONS);
        if (!versions) {
            Logger.log("Runtime", "Cannot load versions.json", LogLevel.Error);
            process.exit(1);
        }
        
        runtime.versions = versions;

        await runtime.resources.loadTiles();
        await runtime.resources.loadObjects();

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
        const accounts = runtime.env.readJSON<Account[]>(FILE_PATH.ACCOUNTS);
        if (!accounts) {
            Logger.log("Runtime", "Failed to read account list.", LogLevel.Error);
            process.exit(1);
        }
        
        Logger.log("Runtime", `Loading ${accounts.length} accounts.`, LogLevel.Info);

        const MAX_ACCOUNT_RETRIES = 10;
        for (const account of accounts) {

            if (!account.clientToken) {
                account.clientToken = AccountService.getClientToken();
                runtime.env.writeJSON(accounts, FILE_PATH.ACCOUNTS);
            }
            
            // Set default values if unspecified
            account.alias       ??= account.guid;
            account.retry       ??= true;
            account.retryCount  ??= 0;
            account.timeout     ??= 0;
            account.autoConnect ??= true;
            account.usesProxy   ??= false;
            account.serverPref  ??= "";

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
    public async addClient(account: Account): Promise<Client> {

        if (!account.guid || !account.password) {
            Logger.log("Runtime", "Error loading the following account, a guid and password is required!", LogLevel.Error);
            account.retry = false;
            return null;
        }

        if (this.clients.has(account.guid)) {
            Logger.log("Runtime", `Error loading account "${account.guid}", account is already loaded! (Duplicate entry in accounts.json)`, LogLevel.Error);
            account.retry = false;
            return null;
        }

        let proxy: SocksProxy;
        if (account.usesProxy && (proxy = this.proxyPool.getNextAvailableProxy()) == null) {
            return Promise.reject(new NoProxiesAvailableError());
        }

        // Access token
        account.accessToken = await this.accountService.getAccessToken(account.guid, account.password, account.clientToken, true, proxy);
        const validAccessToken = await this.accountService.verifyAccessTokenClient(account.accessToken, account.clientToken, proxy);
        if (!validAccessToken) {
            // get a new access token, without using cache
            account.accessToken = await this.accountService.getAccessToken(account.guid, account.password, account.clientToken, false, proxy);
            return null;
        }

        account.charInfo = await this.accountService.getCharacterInfo(account.guid, account.accessToken, proxy);
        const serverList = await this.accountService.getServerList(account.accessToken);

        // Set server preference
        let server = serverList.find(server => server.name == account.serverPref || server.address == account.serverPref);
        if (!server) {
            // Get a random server to connect to
            server = serverList[serverList.length * Math.random() | 0];
            Logger.log("Runtime", `${account.alias}: Preferred server not found. Using ${server.name} instead.`, LogLevel.Warning);
        }

        Logger.log("Runtime", `Loaded "${account.alias}"`, LogLevel.Success);
        const client = new Client(account, this, server, proxy);
        this.clients.set(client.account.guid, client);
        return client;
    }

    /**
     * Removes the client with the given `guid` from this runtime.
     * @param guid The guid of the client to remove.
     */
    public removeClient(guid: string): void {
        // make sure the client is actually in this runtime.
        if (this.clients.has(guid)) {
            const alias = this.clients.get(guid).account.alias;
            this.clients.get(guid).disconnect();
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
