export interface AccessToken {
    token: string;
    timestamp: number;
    expiration: number;
}

export interface TokenCache {
    [guid: string]: {
        accessToken?: AccessToken,
        clientToken?: string,
    }
}
