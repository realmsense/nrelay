import xml2js from "xml2js";
import crypto from "crypto";
import { lookup as dnsLookup } from "dns";
import { isIP } from "net";
import { Logger, LogLevel, HttpClient } from ".";
import { Proxy, Server, CharacterInfo, Environment, AccessToken, FILE_PATH, SERVER_LIST, parseXMLError, Account, ACCOUNT_VERIFY, VERIFY_ACCESS_TOKEN, CHAR_LIST } from "..";

interface CharInfoCache {
    [guid: string]: CharacterInfo;
}

export class AccountService {

    public readonly env: Environment;

    constructor(env: Environment) {
        this.env = env;
    }

    /**
     * Returns the list of RotMG servers.
     * If the the server list is cached (see `FILE_PATH.SERVERS_CACHE`), this function will return from that.
     * Otherwise, if the cache doesn't exist, an appspot request will be made.
     * @param accessToken An account's accessToken is only required to make the appspot request, if the servers are not cached
     */
    public async getServerList(accessToken?: AccessToken): Promise<Server[]> {

        const cachedList = this.env.readJSON<Server[]>(FILE_PATH.SERVERS_CACHE);
        if (cachedList) {
            Logger.log("Account Service", "Using cached server list.", LogLevel.Info);
            return cachedList;
        }

        if (!accessToken) {
            Logger.log("Account Service", "Server list is not cached and no access token was provided!", LogLevel.Error);
            return null;
        }

        const response = await HttpClient.get(SERVER_LIST, {
            query: {
                accessToken: accessToken.token
            }
        });

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
     * Returns a fake SHA-1 hash, to be used a clientToken
     */
    public static getClientToken(): string {
        // https://stackoverflow.com/a/14869745
        const clientToken = crypto.randomBytes(20).toString("hex");
        return clientToken;
    }

    /**
     * Returns the account's AccessToken. The accessToken is not guaranteed to be valid, use `AccountService#verifyAccessTokenClient`.
     * If there is an AccessToken cached in `accounts.json`, the function will return that. (If `cache` is true)
     * Otherwise, a request will be made, and accounts.json will be updated.
     * @param guid The email of the account
     * @param password The password of the account
     * @param clientToken The clientToken of the account
     * @param cache Whether to return from the account's cached accessToken in accounts.json (if it exists)
     * @param proxy Proxy to use if a request must be made. (null to not use a proxy)
     */
    public async getAccessToken(guid: string, password: string, clientToken: string, cache = true, proxy?: Proxy): Promise<AccessToken> {

        const accounts = this.env.readJSON<Account[]>(FILE_PATH.ACCOUNTS);
        const account = accounts.find((value) => value.guid == guid && value.password == password);

        // TODO: check expiration here

        if (account.accessToken && cache) {
            Logger.log(guid, "Using cached AccessToken.", LogLevel.Info);
            return account.accessToken;
        }

        Logger.log(guid, "Fetching AccessToken...");
        const response = await HttpClient.get(ACCOUNT_VERIFY, {
            proxy,
            query: {
                guid,
                password,
                clientToken
            }
        });

        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const obj = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        const accessToken: AccessToken = {
            token: obj["Account"]["AccessToken"],
            timestamp: parseInt(obj["Account"]["AccessTokenTimestamp"]),
            expiration: parseInt(obj["Account"]["AccessTokenExpiration"])
        };

        account.accessToken = accessToken;
        Logger.log(guid, "Using new accessToken, updating accounts.json");
        this.env.writeJSON(accounts, FILE_PATH.ACCOUNTS);
        return accessToken;
    }

    public async verifyAccessTokenClient(accessToken: AccessToken, clientToken: string, proxy?: Proxy): Promise<boolean> {

        const response = await HttpClient.get(VERIFY_ACCESS_TOKEN, {
            proxy,
            query: {
                clientToken,
                accessToken: accessToken.token
            }
        });

        const valid = response == "<Success/>";
        return valid;
    }

    /**
     * Returns an account's character info.
     * Returns from the cache if it exists, otherwise a request will be made and the cache updatd.
     * @param guid The guid of the account to get the character info of.
     * @param password The password of the account to get the character info of.
     * @param proxy An optional proxy to use when making the request.
     */
    public async getCharacterInfo(guid: string, accessToken: AccessToken, proxy?: Proxy): Promise<CharacterInfo> {

        let charInfo: CharInfoCache = this.env.readJSON(FILE_PATH.CHAR_INFO_CACHE);
        if (charInfo && charInfo[guid]) {
            Logger.log("AccountService", "Loaded character info from cache", LogLevel.Success);
            return Promise.resolve(charInfo[guid]);
        }

        charInfo ??= {};

        const response = await HttpClient.get(CHAR_LIST, {
            proxy,
            query: {
                accessToken: accessToken.token
            }
        });

        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const chars = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        charInfo[guid] = {
            nextCharId: parseInt(chars.Chars.nextCharId) ?? 2,
            maxNumChars: parseInt(chars.Chars.maxNumChars) ?? 1,
            charId: parseInt(chars.Chars.Char.id) ?? 1
        };

        Logger.log("AccountService", "Character info loaded", LogLevel.Success);
        this.env.writeJSON(charInfo, FILE_PATH.CHAR_INFO_CACHE);
        return charInfo[guid];
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

    /**
     * Resolves a proxy hostname to ensure its `host` field
     * is always an IP instead of possibly a hostname.
     * @param proxy The proxy to resolve the hostname of.
     */
    public resolveProxyHostname(proxy: Proxy): Promise<void> {
        if (isIP(proxy.host) === 0) {
            Logger.log("AccountService", "Resolving proxy hostname.", LogLevel.Info);
            return new Promise((resolve, reject) => {
                dnsLookup(proxy.host, (err, address) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    Logger.log("AccountService", "Proxy hostname resolved!", LogLevel.Success);
                    proxy.host = address;
                    resolve();
                });
            });
        } else {
            return Promise.resolve();
        }
    }
}
