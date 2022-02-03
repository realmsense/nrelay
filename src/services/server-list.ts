import xml2js from "xml2js";
import { Account, FILE_PATH, HttpClient, Logger, LogLevel, Server, Proxy, Runtime, delay } from "..";

export class ServerList {

    public servers: Server[];
    public loaded: boolean;
    public loading: boolean;

    constructor() {
        this.servers = [];
        this.loaded = false;
        this.loading = false;
    }

    public async waitForMaintanence(proxy?: Proxy): Promise<void> {
        const response = await HttpClient.appspot("/app/init", { platform: "standalonewindows64", key: "9KnJFxtTvLu2frXv" }, proxy);

        const obj = await xml2js.parseStringPromise(response, { explicitArray: false });

        const maintenance = obj["AppSettings"]["Maintenance"];
        if (maintenance) {
            const estimatedTime = new Date(parseInt(maintenance["Time"]) * 1000);
            const message = maintenance["Message"];
            Logger.log("Server List", `Servers are currently under maintenance! Estimated time: ${estimatedTime}. Message: "${message}"`, LogLevel.Warning);
            Logger.log("Server List", "Retrying in 5 minutes...", LogLevel.Warning);
            await delay(5 * 60 * 1000);
            return this.waitForMaintanence(proxy);
        }

        Logger.log("Server List", "Servers are not in maintanence mode.", LogLevel.Info);
    }

    /**
     * Load the 
     * @param useCache Use the cached server list, if it exists. See `FILE_PATH.SERVERS_CACHE`.
     * @param accessToken If the server list is unable to be loaded from the cache, an `Account` must be provided in order to fetch the server list from the RotMG Appspot.
     * @param proxy The proxy to use if an appspot request must be made
     */
    public async loadServers(useCache = true, account?: Account, proxy?: Proxy): Promise<boolean> {

        if (useCache) {
            const cachedList = Runtime.env.readJSON<Server[]>(FILE_PATH.SERVERS_CACHE);
            if (cachedList) {
                this.servers = cachedList;
                Logger.log("Server List", "Loaded server list from cache.", LogLevel.Success);
                this.loaded = true;
                return true;
            }
            else if (!account) {
                Logger.log("Server List", "Unable to load the server list using the cache, fetching from appspot...", LogLevel.Debug);
            }
        }

        // Not using cache and no account was provided, error!
        if (!account) {
            Logger.log("Server List", "Not using cache and no account was provided. Cannot load the server list, aborting!", LogLevel.Error);
            process.exit(1);
        }

        const response = await HttpClient.appspot("/account/servers", { guid: account.guid, password: account.password }, proxy);

        const serversObj = await xml2js.parseStringPromise(response);
        const servers: Server[] = [];
        for (const server of serversObj.Servers.Server) {
            servers.push({
                name: server.Name[0],
                address: server.DNS[0]
            });
        }

        Logger.log("Account Service", "Server list loaded! Writing to cache.", LogLevel.Success);
        Runtime.env.writeJSON(servers, FILE_PATH.SERVERS_CACHE);
        this.servers = servers;
        this.loaded = true;
        this.loading = false;
        return true;
    }

    public getRandomServer(): Server {
        const index = this.servers.length * Math.random() | 0; // https://stackoverflow.com/a/38448710/16999526
        return this.servers[index];
    }
}