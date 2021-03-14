import crypto from "crypto";
import { Account } from ".";
import { Environment } from "..";
import { Logger, LogLevel } from "../services";

export interface AccessToken {
    token: string;
    timestamp: number;
    expiration: number;
}

export enum VerifyAccessTokenResponse {
    /**
     * The accessToken is still valid.
     * 
     * XML Responses: 
     * * `<Success/>`
     */
    Success,

    /**
     * The accessToken has expired but **can** be extended. 
     * 
     * XML Responses: 
     * * ? TODO
     */
    ExpiredCanExtend,

    /**
     * The accessToken has expired but **cannot** be extended. 
     * 
     * XML Responses: 
     * * `<Error>Access token expired and cant be extended</Error>`
     * * `<Error>Invalid previous access token</Error>`
     */
    ExpiredCannotExtend,

    /**
     * The `accessToken` and/or `clientToken` are invalid.
     * 
     * XML Responses: 
     * * `<Error>Token for different machine</Error>`
     */
    InvalidClientToken
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
 export function getClientToken(guid: string, password: string, env: Environment, overwrite = false): string {

    const accounts = env.readJSON<Account[]>("src", "nrelay", "accounts.json");
    const account = accounts.find((value) => value.guid == guid && value.password == password);

    if (account.clientToken && !overwrite) {
        Logger.log(guid, `Using cached clientToken: ${account.clientToken}`);
        return account.clientToken;
    }

    // Random 40char string - https://stackoverflow.com/a/14869745
    account.clientToken = crypto.randomBytes(20).toString("hex");
    Logger.log(guid, `Using new clientToken: ${account.clientToken}. Updating accounts.json`, LogLevel.Debug);
    env.writeJSON(accounts, 4, "src", "nrelay", "accounts.json");
    return account.clientToken;
}