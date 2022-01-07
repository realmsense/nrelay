import { AccessToken, CharacterInfo, Server, Proxy } from ".";
/**
 * Account details of a `Client`, used to connect to RotMG with
 */
export interface Account {
    // details
    alias: string;
    guid: string;
    password: string;
    
    // bot preferences
    autoConnect: boolean;
    serverPref: string;
    usesProxy: boolean;

    // Below are preferences set by Runtime, not present in accounts.json

    proxy: Proxy | undefined;
    server: Server;

    // retries
    retry: boolean;
    retryCount: number;
    timeout: number;
    
    // cache
    clientToken: string;
    accessToken: AccessToken;
    charInfo: CharacterInfo;
}