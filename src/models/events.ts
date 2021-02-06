/**
 * A strongly typed representation of the events which the runtime can raise.
 */
export enum Events {
    /**
     * The event raised when a client is first created from the Runtime.
     */
    ClientCreated = "client_created",
    /**
     * The event raised when a client has connected to a server.
     */
    ClientConnect = "client_connect",
    /**
     * The event raised when a client has disconnected from a server.
     */
    ClientDisconnect = "client_disconnect",
    /**
     * The event raised when a client is ready to send/receive packets.
     */
    ClientReady = "client_ready",
    /**
     * The event raised when the client has drained its move queue.
     */
    ClientArrived = "client_arrived",
    /**
     * The event raised when the client could not connect to the game server.
     */
    ClientConnectError = "client_connect_error",
    /**
     * The event raised when the client connection is forcibly blocked.
     */
    ClientBlocked = "client_connect_blocked",
}
