/**
 * Client events that may be raised by the `Runtime` or `Client` itself
 */
export enum ClientEvent {
    /** Raised when a new client has been created */
    Created = "client_created",

    /** Raised when a client successfully connects to a server */
    Connected = "client_connect",
    
    /** Raised when a client has fully loaded into a new server */
    Ready = "client_ready",

    /** Raised when a client fails to connect to a server */
    ConnectError = "client_connect_error",

    /** Raised when a client has disconnected from a server */
    Disconnect = "client_disconnect",
}