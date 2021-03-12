import crypto from "crypto";

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
 * Returns a random 40 character string. (i.e. a fake SHA-1 hash)
 */
 export function generateRandomClientToken(): string {
    // https://stackoverflow.com/a/14869745
    return crypto.randomBytes(20).toString("hex");
}