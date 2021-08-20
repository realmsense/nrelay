import { SocksProxy } from "socks";
import { AccessToken, CharacterInfo, Server } from ".";

/**
 * Account details of a `Client`, used to connect to RotMG with
 */
export interface Account {
    // details
    alias: string;
    guid: string;
    password: string;
    
    // bot preferences
    pathfinding: boolean;
    autoConnect: boolean;
    serverPref: string;
    usesProxy: boolean;

    // Below are preferences set by Runtime, not present in accounts.json

    proxy: SocksProxy;
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