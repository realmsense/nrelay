import { Client } from "..";

export interface ClientEvent {
    /** Raised when a new client has been created */
    Created: (client: Client) => void,

    /** Raised when a client successfully connects to a server */
    Connected: (client: Client) => void,
    
    /** Raised when a client has fully loaded into a new server */
    Ready: (client: Client) => void,

    /** Raised when a client fails to connect to a server */
    ConnectError: (client: Client, error: Error) => void,

    /** Raised when a client has disconnected from a server */
    Disconnect: (client: Client) => void,
}