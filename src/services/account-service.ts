import xml2js from "xml2js";
import crypto from "crypto";
import { Logger, LogLevel, Appspot, HttpClient, UNITY_REQUEST_HEADERS } from ".";
import { Server, CharacterInfo, Environment, AccessToken, FILE_PATH, Account, TokenCache, CharInfoCache, LanguageString, delay, parseXMLError } from "..";

export class AccountService {

    public readonly env: Environment;

    constructor(env: Environment) {
        this.env = env;
    }

    public async checkMaintanence(): Promise<void> {
        const response = await HttpClient.request("POST", Appspot.APP_INIT, { platform: "standalonewindows64", key: "9KnJFxtTvLu2frXv" }, null, undefined, UNITY_REQUEST_HEADERS);
        const obj = await xml2js.parseStringPromise(response, { explicitArray: false });

        const maintenance = obj["AppSettings"]["Maintenance"];
        if (maintenance) {
            const estimatedTime = new Date(parseInt(maintenance["Time"]) * 1000);
            const message = maintenance["Message"];
            Logger.log("Account Service", `Servers are currently under maintenance! Estimated time: ${estimatedTime}. Message: "${message}"`, LogLevel.Warning);
            Logger.log("Account Service", "Retrying in 5 minutes...", LogLevel.Warning);
            await delay(5 * 60 * 1000);
            this.checkMaintanence();
        }

        Logger.log("Account Service", "Servers are not in maintanence mode.", LogLevel.Info);
    }

    /**
     * Returns the list of RotMG servers.
     * If the the server list is cached (see `FILE_PATH.SERVERS_CACHE`), this function will return from that.
     * Otherwise, if the cache doesn't exist, an appspot request will be made.
     * @param accessToken An account's accessToken is only required to make the appspot request, if the servers are not cached
     */
    public async getServerList(): Promise<Server[] | null>
    public async getServerList(accessToken?: AccessToken): Promise<Server[]>
    public async getServerList(accessToken?: AccessToken): Promise<Server[] | null> {

        const cachedList = this.env.readJSON<Server[]>(FILE_PATH.SERVERS_CACHE);
        if (cachedList) {
            Logger.log("Account Service", "Using cached server list.", LogLevel.Info);
            return cachedList;
        }

        if (!accessToken) {
            Logger.log("Account Service", "Server list is not cached and no access token was provided!", LogLevel.Error);
            return null;
        }

        const response = await HttpClient.request("POST", Appspot.SERVER_LIST, { accessToken: accessToken.token }, null, undefined, UNITY_REQUEST_HEADERS);

        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const serversObj = await xml2js.parseStringPromise(response);
        const servers: Server[] = [];

        for (const server of serversObj.Servers.Server) {
            servers.push({
                name: server.Name[0],
                address: server.DNS[0]
            });
        }

        Logger.log("Account Service", "Server list loaded!", LogLevel.Success);
        this.env.writeJSON(servers, FILE_PATH.SERVERS_CACHE);
        return servers;
    }

    /**
     * Returns an arary of language strings, which are used for translations in the game.
     */
    public async getLanguageStrings(): Promise<LanguageString[]> {
        const cachedList = this.env.readJSON<LanguageString[]>(FILE_PATH.LANGUAGE_STRINGS);
        if (cachedList) {
            Logger.log("Account Service", "Using cached language strings.", LogLevel.Info);
            return cachedList;
        }

        const response = await HttpClient.request("POST", Appspot.LANGUAGE_STRINGS, { languageType: "en" }, null, undefined, UNITY_REQUEST_HEADERS);

        const languageStrings: LanguageString[] = [];
        for (const value of response) {
            languageStrings.push({
                key: value[0],
                value: value[1],
                language: value[2],
            });
        }

        Logger.log("Account Service", "Loaded language strings!", LogLevel.Success);
        this.env.writeJSON(languageStrings, FILE_PATH.LANGUAGE_STRINGS);
        return languageStrings;
    }

    /**
     * Returns a fake SHA-1 hash to be used as a client's HWID token
     * @param guid The account's guid, used for caching the token
     * @param useCache Whether to search and return a cached token, if one exists. Otherwise, a new clientToken is generated and cached.
     */
    public getClientToken(guid: string, useCache = true): Promise<string> {
        return this.env.acquireLock<string>(FILE_PATH.TOKEN_CACHE, () => {
            const cache = this.env.readJSON<TokenCache>(FILE_PATH.TOKEN_CACHE) || {};
            cache[guid] ??= {};

            if (useCache && cache[guid]?.clientToken) {
                Logger.log(guid, "Using cached client token.", LogLevel.Info);
                return cache[guid].clientToken as string;
            }

            Logger.log(guid, "Using new client token, updating cache.", LogLevel.Info);
            const clientToken = crypto.randomBytes(20).toString("hex");
            cache[guid].clientToken = clientToken;
            this.env.writeJSON(cache, FILE_PATH.TOKEN_CACHE);
            return clientToken;
        });
    }

    /**
     * Returns the account's AccessToken. The accessToken is not guaranteed to be valid, use `AccountService#verifyAccessTokenClient`.
     * @param account Should have a valid `guid`, `password`, `clientToken` and optionally a `proxy` to use if an appspot request is made
     * @param useCache Whether to search and return a cached accessToken, if one exists and is not expired. Otherwise, an AppSpot is request and the cache is updated.
     */
    public async getAccessToken(account: Account, useCache = true): Promise<AccessToken> {
        return this.env.acquireLock(FILE_PATH.TOKEN_CACHE, async () => {
            const cache = this.env.readJSON<TokenCache>(FILE_PATH.TOKEN_CACHE) || {};
            cache[account.guid] ??= {};

            const cachedToken = cache[account.guid]?.accessToken;
            if (useCache && cachedToken) {
                const expiration = cachedToken.timestamp + cachedToken.expiration;
                const timestamp = Math.floor(Date.now() / 1000);
                if (expiration > timestamp) {
                    Logger.log(account.guid, "Using cached AccessToken.", LogLevel.Info);
                    return cachedToken;
                }
            }

            Logger.log(account.guid, "Fetching AccessToken...");
            const response = await HttpClient.request("POST", Appspot.ACCOUNT_VERIFY, { guid: account.guid, password: account.password, clientToken: account.clientToken }, null, account.proxy, UNITY_REQUEST_HEADERS);

            const obj = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
            const accessToken: AccessToken = {
                token: obj["Account"]["AccessToken"],
                timestamp: parseInt(obj["Account"]["AccessTokenTimestamp"]),
                expiration: parseInt(obj["Account"]["AccessTokenExpiration"])
            };

            cache[account.guid].accessToken = accessToken;
            Logger.log(account.guid, "Using new accessToken, updating cache", LogLevel.Debug);
            this.env.writeJSON(cache, FILE_PATH.TOKEN_CACHE);
            return accessToken;
        });
    }

    /**
     * Used to send the AppSpot request to verify an accessToken + clientToken
     * @returns Whether the accessToken was successfuly verified
     */
    private async verifyAccessTokenClient(account: Account): Promise<boolean> {
        const params = {
            clientToken: account.clientToken,
            accessToken: account.accessToken.token
        };
        const response = await HttpClient.request("POST", Appspot.VERIFY_ACCESS_TOKEN, params, null, account.proxy, UNITY_REQUEST_HEADERS);
        const valid = response == "<Success/>";
        return valid;
    }

    /**
     * Used to validate an account's AccessToken. This method will attempt to validate the account's current access token. 
     * If it is not valid, a new one will be fetched and validated.
     * @param account
     * @returns {boolean} Whether the accessToken is valid or not.
     */
    public async verifyAccessToken(account: Account): Promise<boolean> {
        let valid = await this.verifyAccessTokenClient(account);
        if (valid) return true;

        // Try again with a new AccessToken
        account.accessToken = await this.getAccessToken(account, false);
        valid = await this.verifyAccessTokenClient(account);
        return valid;
    }

    /**
     * Returns an account's character information
     * @param account The account to use. Must have a `guid` and, if the charinfo is not cached, a valid accessToken to make the AppSpot request.
     * @param useCache Whether the search and return from the cache, if the charinfo exists in the cache.
     * @returns 
     */
    public async getCharacterInfo(account: Account, useCache = true): Promise<CharacterInfo> {

        const cache = this.env.readJSON<CharInfoCache>(FILE_PATH.CHAR_INFO_CACHE) || {};
        if (useCache && cache[account.guid]) {
            Logger.log("AccountService", "Using cached character info", LogLevel.Success);
            return cache[account.guid];
        }

        Logger.log(account.guid, "Fetching character info...");
        const response = await HttpClient.request("POST", Appspot.CHAR_LIST, { accessToken: account.accessToken.token }, null, account.proxy, UNITY_REQUEST_HEADERS);
        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const chars = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        cache[account.guid] = {
            nextCharId: parseInt(chars.Chars.nextCharId) ?? 2,
            maxNumChars: parseInt(chars.Chars.maxNumChars) ?? 1,
            charId: parseInt(chars.Chars.Char.id) ?? 1
        };

        Logger.log("AccountService", "Character info loaded, updating cache", LogLevel.Success);
        this.env.writeJSON(cache, FILE_PATH.CHAR_INFO_CACHE);
        return cache[account.guid];
    }

    /**
     * Updates the cached character info for the account with the `guid`.
     * @param guid The guid of the account to update the cache of.
     * @param charInfo The new info to store in the cache.
     */
    public updateCharInfoCache(guid: string, charInfo: CharacterInfo): void {
        const cacheUpdate: CharInfoCache = {};
        cacheUpdate[guid] = charInfo;
        // this.env.updateJSON(cacheUpdate, "nrelay", "char-info.cache.json");
        Logger.log("AccountService", "Character info cache updated!", LogLevel.Success);
    }
}
