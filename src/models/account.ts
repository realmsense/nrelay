import { AccessToken, CharacterInfo } from ".";

/**
 * Account details of a `Client`, used to connect to RotMG with
 */
export interface Account {
    // details
    alias: string;
    guid: string;
    password: string;
    
    // retries
    retry: boolean;
    retryCount: number;
    timeout: number;
    
    // cache
    clientToken: string;
    accessToken: AccessToken;
    charInfo: CharacterInfo;
    
    // bot preferences
    pathfinding: boolean;
    autoConnect: boolean;
    serverPref: string;
    usesProxy: boolean;
}