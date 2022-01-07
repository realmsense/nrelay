import xml2js from "xml2js";
import crypto from "crypto";
import { Logger, LogLevel, Appspot, HttpClient, UNITY_REQUEST_HEADERS } from ".";
import { CharacterInfo, Environment, AccessToken, FILE_PATH, Account, TokenCache, CharInfoCache, LanguageString, delay, Proxy } from "..";

export class AccountService {

    public readonly env: Environment;

    constructor(env: Environment) {
        this.env = env;
    }

    public async checkMaintanence(proxy?: Proxy): Promise<void> {
        const response = await HttpClient.request("POST", Appspot.APP_INIT, { platform: "standalonewindows64", key: "9KnJFxtTvLu2frXv" }, null, proxy, UNITY_REQUEST_HEADERS);
        const obj = await xml2js.parseStringPromise(response, { explicitArray: false });

        const maintenance = obj["AppSettings"]["Maintenance"];
        if (maintenance) {
            const estimatedTime = new Date(parseInt(maintenance["Time"]) * 1000);
            const message = maintenance["Message"];
            Logger.log("Account Service", `Servers are currently under maintenance! Estimated time: ${estimatedTime}. Message: "${message}"`, LogLevel.Warning);
            Logger.log("Account Service", "Retrying in 5 minutes...", LogLevel.Warning);
            await delay(5 * 60 * 1000);
            return this.checkMaintanence(proxy);
        }

        Logger.log("Account Service", "Servers are not in maintanence mode.", LogLevel.Info);
    }

    /**
     * Returns an arary of language strings, which are used for translations in the game.
     */
    public async getLanguageStrings(proxy?: Proxy): Promise<LanguageString[]> {
        const cachedList = this.env.readJSON<LanguageString[]>(FILE_PATH.LANGUAGE_STRINGS);
        if (cachedList) {
            Logger.log("Account Service", "Using cached language strings.", LogLevel.Info);
            return cachedList;
        }

        const response = await HttpClient.request("POST", Appspot.LANGUAGE_STRINGS, { languageType: "en" }, null, proxy, UNITY_REQUEST_HEADERS);

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
     * Perform all the logic related to an account's tokens. Including fetching the clientToken and accessToken and verifying both.
     * This method will attempt to verify the cached accessToken, if one exists. Otherwise it will retry with a fresh token.
     * @returns `true` if the account's accessToken was verified. `false` otherwise.
     */
    public async verifyTokens(account: Account): Promise<boolean> {
        account.clientToken ??= await this.getClientToken(account.guid);
        account.accessToken = await this.getAccessToken(account);

        let valid = await this.verifyAccessTokenClient(account);
        if (valid) return true;

        // Try again with a new AccessToken
        account.accessToken = await this.getAccessToken(account, false);
        valid = await this.verifyAccessTokenClient(account);
        return valid;
    }

    /**
     * Returns a fake SHA-1 hash to be used as a client's HWID token
     * @param guid The account's guid, used for caching the token
     * @param useCache Whether to search and return a cached token, if one exists. Otherwise, a new clientToken is generated and cached.
     */
    private getClientToken(guid: string, useCache = true): Promise<string> {
        return this.env.acquireLock<string>(FILE_PATH.TOKEN_CACHE, () => {
            const cache = this.env.readJSON<TokenCache>(FILE_PATH.TOKEN_CACHE) || {};
            cache[guid] ??= {};

            if (useCache && cache[guid]?.clientToken) {
                Logger.log(guid, "Using cached client token.", LogLevel.Info);
                return cache[guid].clientToken as string;
            }

            Logger.log(guid, "Using new client token, updating cache.", LogLevel.Info);
            const clientToken = crypto.randomBytes(20).toString("hex"); // Generate a fake SHA-1 hash (40 chars)
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
    private async getAccessToken(account: Account, useCache = true): Promise<AccessToken> {
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
     * Returns an account's character information
     * @param account The account to use. Must have a `guid` and, if the charinfo is not cached, a valid accessToken to make the AppSpot request.
     * @param useCache Whether the search and return from the cache, if the charinfo exists in the cache.
     * @returns 
     */
    public async getCharacterInfo(account: Account, useCache = true): Promise<CharacterInfo> {

        const cache = this.env.readJSON<CharInfoCache>(FILE_PATH.CHAR_INFO_CACHE) || {};
        if (useCache && cache[account.guid]) {
            Logger.log("Account Service", "Using cached character info", LogLevel.Success);
            return cache[account.guid];
        }

        Logger.log(account.guid, "Fetching character info...");
        const response = await HttpClient.request("POST", Appspot.CHAR_LIST, { accessToken: account.accessToken.token }, null, account.proxy, UNITY_REQUEST_HEADERS);

        const chars = await xml2js.parseStringPromise(response, { mergeAttrs: true, explicitArray: false });
        cache[account.guid] = {
            nextCharId: parseInt(chars.Chars.nextCharId) ?? 2,
            maxNumChars: parseInt(chars.Chars.maxNumChars) ?? 1,
            charId: parseInt(chars.Chars.Char.id) ?? 1
        };

        Logger.log("Account Service", "Character info loaded, updating cache", LogLevel.Success);
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
        Logger.log("Account Service", "Character info cache updated!", LogLevel.Success);
    }
}
