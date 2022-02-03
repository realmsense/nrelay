import fs from "fs";
import EventEmitter from "events";
import TypedEmitter from "typed-emitter";
import { ClientManager, Environment, VersionConfig, FILE_PATH } from ".";
import { ResourceManager, PluginManager, ProxyPool, RunOptions, LogLevel, Logger, ConsoleLogger, FileLogger, Account, ClientEvent, ServerList, LanguageString, Proxy, getTimestamp, AccountInfo } from "..";

/**
 * The main (static) class that manages an instance of nrelay.
 * The runtime handles clients, resources, plugins, and other services used by nrelay. 
 */
export class Runtime {

    public static emitter        : TypedEmitter<ClientEvent>;
    public static env            : Environment;
    public static clientManager  : ClientManager;
    public static resourceManager: ResourceManager;
    public static pluginManager  : PluginManager;
    public static proxyPool      : ProxyPool;
    public static serverList     : ServerList;
    
    public static versions: VersionConfig;
    public static languageStrings: LanguageString[];

    /** Fallback proxy */
    public static proxy: Proxy | undefined;

    private constructor() {
        Runtime.emitter         = new EventEmitter();
        Runtime.env             = new Environment();
        Runtime.clientManager   = new ClientManager();
        Runtime.resourceManager = new ResourceManager();
        Runtime.pluginManager   = new PluginManager();
        Runtime.serverList      = new ServerList();
        Runtime.proxyPool       = new ProxyPool();
    }

    public static async start(options: RunOptions): Promise<void> {

        // Call runtime ctor 
        new Runtime();

        // Set default options if unspecified
        options            ??= {};
        options.debug      ??= false;
        options.plugins    ??= true;
        options.pluginPath ??= "dist/plugins";
        options.logFile    ??= true;
        options.maxClients ??= 0;

        // Setup Logging
        const logLevel = options.debug ? LogLevel.Debug : LogLevel.Info;
        Logger.addLogger(new ConsoleLogger(logLevel));

        if (options.logFile) {
            Logger.log("Runtime", "Creating a log file.", LogLevel.Info);
            const logFile = Runtime.env.writeFile("", [...FILE_PATH.LOG_PATH, `nrelay-${getTimestamp()}.log`]); // clear file and ensure it exists
            const writeStream = fs.createWriteStream(logFile);
            Logger.addLogger(new FileLogger(writeStream));
        }

        await Logger.printHeader();

        // Load proxies
        Runtime.proxyPool.loadProxies();
        Runtime.proxy = Runtime.proxyPool.getRandomProxy();

        // Load version info
        let versionConfig = Runtime.env.readJSON<VersionConfig>(FILE_PATH.VERSIONS);
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

        Runtime.versions = versionConfig;

        // Update resources
        if (options.update && (options.update.enabled || options.update.force)) {
            await Runtime.resourceManager.updateResources(versionConfig, options.update);
        }

        // Load Resources
        Runtime.languageStrings = await Runtime.resourceManager.getLanguageStrings(Runtime.proxy);
        await Runtime.resourceManager.loadTiles();
        await Runtime.resourceManager.loadObjects();

        // Load plugins / packet hooks
        if (options.plugins) {
            const pluginsPath = options.pluginPath ?? "dist/plugins";
            await Runtime.pluginManager.loadPlugins(pluginsPath);
        } else {
            Logger.log("Runtime", "Plugin loading disabled", LogLevel.Info);
        }

        // Wait for maintanence to finish
        await Runtime.serverList.waitForMaintanence(Runtime.proxy);

        // Load account list
        const accountInfo = Runtime.env.readJSON<AccountInfo[]>(FILE_PATH.ACCOUNTS, true);
        const accounts = accountInfo.map((value) => new Account(value));
        
        // Load servers, preferably from cache - otherwise we're assuming the first account is good to fetch from appspot
        const serversLoaded = await Runtime.serverList.loadServers(true, accounts[0], Runtime.proxy);
        if (!serversLoaded) {
            Logger.log("Runtime", "Failed to load servers, aborting!", LogLevel.Error);
            process.exit(1);
        }

        // Finally, asynchronously load clients
        void Runtime.clientManager.loadClients(accounts, options.maxClients);
    }
}
