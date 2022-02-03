import crypto from "crypto";
import xml2js from "xml2js";
import { AccessToken, CharacterInfo, Server, Proxy, TokenCache, CharInfoCache, Player } from ".";
import { FILE_PATH, HttpClient, Logger, LogLevel, Runtime } from "..";

/**
 * Account config used in `accounts.json`
 */
export interface AccountInfo {
    // details
    alias   : string;
    guid    : string;
    password: string;

    // bot preferences
    autoConnect: boolean;
    serverPref : string;
    usesProxy  : boolean;
}

export class Account {

    public readonly info: AccountInfo;

    // details
    public alias   : string;
    public guid    : string;
    public password: string;

    // tokens
    public clientToken: string;
    public accessToken: AccessToken;
    public charInfo   : CharacterInfo;

    // preferences
    public autoConnect: boolean;

    // networking
    public server: Server;
    public proxy?: Proxy;

    constructor(info: AccountInfo) {
        this.info = info;
        this.alias       = info.alias ?? info.guid;
        this.guid        = info.guid;
        this.password    = info.password;
        this.autoConnect = info.autoConnect;
    }

    public async loadCharacterInfo(useCache = true): Promise<void> {
        const cache = Runtime.env.readJSON<CharInfoCache>(FILE_PATH.CHAR_INFO_CACHE) || {};
        if (useCache && cache[this.guid]) {
            this.charInfo = cache[this.guid];
            Logger.log("Account", `[${this.alias}] Loaded character info from cache`, LogLevel.Info);
            return;
        }
        
        Logger.log("Account", `[${this.alias}] Fetching character info`, LogLevel.Info);
        const response = await HttpClient.appspot("/char/list", { accessToken: this.accessToken.token, do_login: false }, this.proxy);

        const chars = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        cache[this.guid] = {
            nextCharId : parseInt(chars.Chars.nextCharId)   ?? 2,
            maxNumChars: parseInt(chars.Chars.maxNumChars)  ?? 1,
            charId     : parseInt(chars.Chars.Char.id)      ?? 1
        };

        Logger.log("Account", `[${this.alias}] Character info loaded, updating cache`, LogLevel.Success);
        Runtime.env.writeJSON(cache, FILE_PATH.CHAR_INFO_CACHE);
        this.charInfo = cache[this.guid];
    }

    public async updateCharInfoCache(): Promise<void> {
        const cache = Runtime.env.readJSON<CharInfoCache>(FILE_PATH.CHAR_INFO_CACHE) || {};
        cache[this.guid] = this.charInfo;
        Runtime.env.writeJSON(cache, FILE_PATH.CHAR_INFO_CACHE);
        Logger.log(this.alias, "Updated character info cache", LogLevel.Success);
    }

    public async verifyTokens(): Promise<boolean> {
        Logger.log(this.alias, "Verifying tokens", LogLevel.Info);

        await this.fetchClientToken();
        if (!await this.fetchAccessToken()) return false;

        if (await this.verifyAccessTokenClient()) return true;

        // retry with a new accessToken
        await this.fetchAccessToken(false);
        return this.verifyAccessTokenClient();
    }

    private async fetchClientToken(useCache = true): Promise<void> {

        // Token is already set
        if (useCache && this.clientToken) {
            return;
        }

        return Runtime.env.acquireLock(FILE_PATH.TOKEN_CACHE, () => {

            const cache = Runtime.env.readJSON<TokenCache>(FILE_PATH.TOKEN_CACHE) || {};
            cache[this.guid] ??= {};

            if (useCache && cache[this.guid]?.clientToken) {
                Logger.log(this.alias, "Using cached client token.", LogLevel.Info);
                this.clientToken = cache[this.guid].clientToken as string;
                return;
            }

            Logger.log(this.alias, "Using new client token, updating cache.", LogLevel.Info);
            const clientToken = crypto.randomBytes(20).toString("hex"); // Generate a fake SHA-1 hash (40 chars)
            cache[this.guid].clientToken = clientToken;
            Runtime.env.writeJSON(cache, FILE_PATH.TOKEN_CACHE);
            this.clientToken = clientToken;
        });
    }

    private async fetchAccessToken(useCache = true): Promise<boolean> {

        // Token is already set
        if (useCache && this.accessToken) {
            return true;
        }

        return Runtime.env.acquireLock(FILE_PATH.TOKEN_CACHE, async () => {
            const cache = Runtime.env.readJSON<TokenCache>(FILE_PATH.TOKEN_CACHE) || {};
            cache[this.guid] ??= {};

            const cachedToken = cache[this.guid]?.accessToken;
            if (useCache && cachedToken) {
                const expiration = cachedToken.timestamp + cachedToken.expiration;
                const timestamp = Math.floor(Date.now() / 1000);
                if (expiration > timestamp) {
                    Logger.log(this.alias, "Using cached AccessToken.", LogLevel.Info);
                    this.accessToken = cachedToken;
                    return true;
                }
            }

            Logger.log(this.alias, "Fetching AccessToken...");

            const params = {
                guid: this.guid,
                password: this.password,
                clientToken: this.clientToken
            };

            const response = await HttpClient.appspot("/account/verify", params, this.proxy, false);
            const obj = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });

            if (obj["Error"]) {
                Logger.log(this.alias, `Failed to fetch access token! Error: ${obj["Error"]}`, LogLevel.Error);
                return false;
            }

            const accessToken: AccessToken = {
                token     : obj["Account"]["AccessToken"],
                timestamp : parseInt(obj["Account"]["AccessTokenTimestamp"]),
                expiration: parseInt(obj["Account"]["AccessTokenExpiration"])
            };

            cache[this.guid].accessToken = accessToken;
            Logger.log(this.alias, "Using new accessToken, updating cache", LogLevel.Debug);
            Runtime.env.writeJSON(cache, FILE_PATH.TOKEN_CACHE);
            this.accessToken = accessToken;
            return true;
        });
    }

    private async verifyAccessTokenClient(): Promise<boolean> {
        const params = {
            clientToken: this.clientToken,
            accessToken: this.accessToken.token
        };

        const response = await HttpClient.appspot("/account/verifyAccessTokenClient", params, this.proxy, false);
        return (response == "<Success/>");
    }
}