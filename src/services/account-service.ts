import xml2js from "xml2js";
import { lookup as dnsLookup } from "dns";
import { isIP } from "net";
import { Logger, LogLevel } from "../core";
import { AccountInUseError, CharacterInfo, Proxy, CHAR_LIST, ACCOUNT_VERIFY, VERIFY_ACCESS_TOKEN, SERVER_LIST } from "../models";
import { Environment } from "../runtime/environment";
import { ServerList } from "../runtime/server-list";
import { HttpClient } from "./http";
import * as xmlToJSON from "./xmltojson";
import { AccessToken, VerifyAccessTokenResponse } from "../models/access-token";

const ERROR_REGEX = /<Error\/?>(.+)<\/?Error>/;

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
    public getServerList(accessToken: AccessToken): Promise<ServerList>
    /**
     * Returns the list of RotMG servers from the cached file, `servers.cache.json`.
     * An accessToken is required to make the web request if the cached file doesn't exist.
     */
    public getServerList(): Promise<ServerList>
    public getServerList(accessToken?: AccessToken): Promise<ServerList> {
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
        return HttpClient.get(SERVER_LIST, {
            query: {
                accessToken: accessToken.token
            },
        }).then((response) => {
            // check for errors.
            const maybeError = this.getError(response);
            if (maybeError) {
                throw maybeError;
            } else {
                const servers: ServerList = xmlToJSON.parseServers(response);
                Logger.log("AccountService", "Server list loaded!", LogLevel.Success);
                // update the cache.
                this.env.writeJSON(servers, 4, "src", "nrelay", "servers.cache.json");
                return servers;
            }
        });
    }

    public static async getAccessToken(guid: string, password: string, clientToken: string, proxy?: Proxy): Promise<AccessToken> {
        const response = await HttpClient.get(ACCOUNT_VERIFY, {
            proxy,
            query: {
                guid,
                password,
                clientToken
            }
        });
        
        const obj = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        return {
            token: obj["Account"]["AccessToken"],
            timestamp: parseInt(obj["Account"]["AccessTokenTimestamp"]),
            expiration: parseInt(obj["Account"]["AccessTokenExpiration"]),
        } as AccessToken;
    }

    public static async verifyAccessTokenClient(accessToken: AccessToken, clientToken: string, proxy?: Proxy): Promise<VerifyAccessTokenResponse> {
        
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
    public getCharacterInfo(guid: string, accessToken: AccessToken, proxy?: Proxy): Promise<CharacterInfo> {
        // look in the cache.
        Logger.log("AccountService", "Loading character info...", LogLevel.Info);
        const cachedCharInfo = this.env.readJSON<CharInfoCache>("src", "nrelay", "char-info.cache.json");
        if (cachedCharInfo && cachedCharInfo[guid]) {
            Logger.log("AccountService", "Cached character info loaded!", LogLevel.Success);
            return Promise.resolve(cachedCharInfo[guid]);
        } else {
            // if there is no cache, fetch the info.
            return HttpClient.get(CHAR_LIST, {
                proxy,
                query: {
                    accessToken: accessToken.token,
                },
            }).then((response) => {
                // check for errors.
                const maybeError = this.getError(response);
                if (maybeError) {
                    throw maybeError;
                }
                const charInfo = xmlToJSON.parseAccountInfo(response);
                Logger.log("AccountService", "Character info loaded!", LogLevel.Success);
                // update the cache.
                const cacheUpdate: CharInfoCache = {};
                cacheUpdate[guid] = charInfo;
                this.env.updateJSON(cacheUpdate, "src", "nrelay", "char-info.cache.json");
                return charInfo;
            });
        }
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

    private getError(response: string): Error {
        // check for acc in use.
        const accInUse = AccountInUseError.regex.exec(response);
        if (accInUse) {
            const error = new AccountInUseError(parseInt(accInUse[1], 10));
            return error;
        }
        // check for the generic <Error>some error</Error>
        const otherError = ERROR_REGEX.exec(response);
        if (otherError) {
            const error = new Error(otherError[1]);
            error.name = "OTHER_ERROR";
            return error;
        }

        // no errors.
        return undefined;
    }
}
