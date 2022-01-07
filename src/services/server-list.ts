import xml2js from "xml2js";
import { Account, Appspot, FILE_PATH, HttpClient, Logger, LogLevel, Server, UNITY_REQUEST_HEADERS, Runtime } from "..";

export class ServerList {

    public servers: Server[];
    public loaded: boolean;

    private runtime: Runtime;

    constructor(runtime: Runtime) {
        this.servers = [];
        this.loaded = false;
        this.runtime = runtime;
    }

    /**
     * Load the 
     * @param useCache Use the cached server list, if it exists. See `FILE_PATH.SERVERS_CACHE`.
     * @param accessToken If the server list is unable to be loaded from the cache, an `Account` must be provided in order to fetch the server list from the RotMG Appspot.
     */
    public async loadServers(useCache = true, account?: Account): Promise<boolean> {

        if (useCache) {
            const cachedList = this.runtime.env.readJSON<Server[]>(FILE_PATH.SERVERS_CACHE);
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

        // Validate account first
        const validTokens = await this.runtime.accountService.verifyTokens(account);
        if (!validTokens) {
            Logger.log("Server List", `Failed to verify tokens for account "${account.guid}" while fetching a new server list.`, LogLevel.Error);
            account.retry = false;
            return false;
        }

        const response = await HttpClient.request("POST", Appspot.SERVER_LIST, { accessToken: account.accessToken.token }, null, account.proxy, UNITY_REQUEST_HEADERS);

        const serversObj = await xml2js.parseStringPromise(response);
        const servers: Server[] = [];
        for (const server of serversObj.Servers.Server) {
            servers.push({
                name: server.Name[0],
                address: server.DNS[0]
            });
        }

        Logger.log("Account Service", "Server list loaded! Writing to cache.", LogLevel.Success);
        this.runtime.env.writeJSON(servers, FILE_PATH.SERVERS_CACHE);
        this.servers = servers;
        return true;

    }

    public getRandomServer(): Server {
        const index = this.servers.length * Math.random() | 0; // https://stackoverflow.com/a/38448710/16999526
        return this.servers[index];
    }
}