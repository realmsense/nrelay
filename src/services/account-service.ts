import xml2js from "xml2js";
import crypto from "crypto";
import { lookup as dnsLookup } from "dns";
import { isIP } from "net";
import { Logger, LogLevel } from "../core";
import { CharacterInfo, Proxy, CHAR_LIST, ACCOUNT_VERIFY, VERIFY_ACCESS_TOKEN, SERVER_LIST, parseXMLError, Account } from "../models";
import { Environment } from "../runtime/environment";
import { ServerList } from "../runtime/server-list";
import { HttpClient } from "./http";
import * as xmlToJSON from "./xmltojson";
import { AccessToken, VerifyAccessTokenResponse } from "../models/access-token";

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
     * Attempts to get the server list from the cached file, `servers.cache.json`.
     * Otherwise, if the cache doesn't exist, a web request will be made.
     * @param accessToken 
     */
    public async getServerList(accessToken: AccessToken): Promise<ServerList>
    /**
     * Returns the list of RotMG servers from the cached file, `servers.cache.json`.
     * An accessToken is required to make the web request if the cached file doesn't exist.
     */
    public async getServerList(): Promise<ServerList>
    public async getServerList(accessToken?: AccessToken): Promise<ServerList> {
        Logger.log("AccountService", "Loading server list...", LogLevel.Info);

        const cachedServerList = this.env.readJSON<ServerList>("src", "nrelay", "servers.cache.json");
        if (cachedServerList) {
            Logger.log("AccountService", "Cached server list loaded!", LogLevel.Success);
            return Promise.resolve(cachedServerList);
        }

        if (!accessToken) {
            Logger.log("AccountService", "Serverlist is not cached and no accessToken was provided!", LogLevel.Error);
            return null;
        }

        // if there is no cache, fetch the servers.
        const response = await HttpClient.get(SERVER_LIST, {
            query: {
                accessToken: accessToken.token
            }
        });

        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const servers: ServerList = xmlToJSON.parseServers(response);
        Logger.log("AccountService", "Server list loaded!", LogLevel.Success);
        this.env.writeJSON(servers, 4, "src", "nrelay", "servers.cache.json");
        return servers;
    }

    /**
     * Returns a fake SHA-1 hash, to be used a clientToken.
     * If there is a clientToken saved in `accounts.json`, this function will return that.
     * Otherwise, it will generate a new clientToken and update `accounts.json`
     * @param guid The guid of the account
     * @param password The password of the account
     * @param env The Enviornment class used to read/write JSON. (Defined in `src\runtime\environment.ts`)
     * @param overwrite Whether to overwrite the cached clientToken, regardless if it exists
     */
    public getClientToken(guid: string, password: string, overwrite = false): string {

        const accounts = this.env.readJSON<Account[]>("src", "nrelay", "accounts.json");
        const account = accounts.find((value) => value.guid == guid && value.password == password);

        if (account.clientToken && !overwrite) {
            Logger.log(guid, `Using cached clientToken: ${account.clientToken}`, LogLevel.Info);
            return account.clientToken;
        }

        // Random 40char string - https://stackoverflow.com/a/14869745
        account.clientToken = crypto.randomBytes(20).toString("hex");
        Logger.log(guid, `Using new clientToken: ${account.clientToken}. Updating accounts.json`, LogLevel.Info);
        this.env.writeJSON(accounts, 4, "src", "nrelay", "accounts.json");
        return account.clientToken;
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

        const accounts = this.env.readJSON<Account[]>("src", "nrelay", "accounts.json");
        const account = accounts.find((value) => value.guid == guid && value.password == password);
    
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
        this.env.writeJSON<Account[]>(accounts, 4, "src", "nrelay", "accounts.json");
        return accessToken;
    }

    public async verifyAccessTokenClient(accessToken: AccessToken, clientToken: string, proxy?: Proxy): Promise<VerifyAccessTokenResponse> {
        
        const response = await HttpClient.get(VERIFY_ACCESS_TOKEN, {
            proxy,
            query: {
                clientToken,
                accessToken: accessToken.token
            }
        });

        switch (response) {
            case "<Success/>":
                return VerifyAccessTokenResponse.Success;
        
            // TOOD: get the xml code for this
            case "expired":
                return VerifyAccessTokenResponse.ExpiredCanExtend;
                
            case "<Error>Token for different machine</Error>":
            case "<Error>Access token expired and cant be extended</Error>":
                return VerifyAccessTokenResponse.ExpiredCannotExtend;
                    
            case "<Error>Invalid previous access token</Error>":
                return VerifyAccessTokenResponse.InvalidClientToken;

            default:
                Logger.log("AccountService", `Received unknown response from ${VERIFY_ACCESS_TOKEN}: \n${response}`, LogLevel.Error);
                return VerifyAccessTokenResponse.ExpiredCannotExtend;
        }
    }

    /**
     * Gets the character info for the account with the guid/password provided.
     * This will look in the cache first, and it will only request the info
     * from the rotmg server if the char info was not found in the cache.
     * @param guid The guid of the account to get the character info of.
     * @param password The password of the account to get the character info of.
     * @param proxy An optional proxy to use when making the request.
     */
    public async getCharacterInfo(guid: string, accessToken: AccessToken, proxy?: Proxy): Promise<CharacterInfo> {
        // look in the cache.
        Logger.log("AccountService", "Loading character info...", LogLevel.Info);
        const cachedCharInfo = this.env.readJSON<CharInfoCache>("src", "nrelay", "char-info.cache.json");
        if (cachedCharInfo && cachedCharInfo[guid]) {
            Logger.log("AccountService", "Cached character info loaded!", LogLevel.Success);
            return Promise.resolve(cachedCharInfo[guid]);
        }

        const response = await HttpClient.get(CHAR_LIST, {
            proxy,
            query: {
                accessToken: accessToken.token,
            }
        });

        const error = parseXMLError(response);
        if (error) {
            throw error;
        }

        const charInfo = xmlToJSON.parseAccountInfo(response);
        Logger.log("AccountService", "Character info loaded!", LogLevel.Success);
        
        const cacheUpdate: CharInfoCache = {};
        cacheUpdate[guid] = charInfo;
        this.env.updateJSON(cacheUpdate, "src", "nrelay", "char-info.cache.json");
        return charInfo;
    }

    /**
     * Updates the cached character info for the account with the `guid`.
     * @param guid The guid of the account to update the cache of.
     * @param charInfo The new info to store in the cache.
     */
    public updateCharInfoCache(guid: string, charInfo: CharacterInfo): void {
        const cacheUpdate: CharInfoCache = {};
        cacheUpdate[guid] = charInfo;
        this.env.updateJSON(cacheUpdate, "nrelay", "char-info.cache.json");
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
