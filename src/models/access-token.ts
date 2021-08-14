export interface AccessToken {
    token: string;
    timestamp: number;
    expiration: number;
}

export interface AccessTokenCache {
    [guid: string]: AccessToken;
}
