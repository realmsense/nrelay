import * as net from "net";
import { SocksClient, SocksProxy } from "socks";

/**
 * Creates a connection to the specified host and port, optionally through
 * a provided proxy. Returns a promise which is resolved when the connection
 * has been established.
 * @param host The host to connect to.
 * @param port The port to connect to.
 * @param proxy An optional proxy to use when connecting.
 */
export async function createConnection(host: string, port: number, proxy?: SocksProxy): Promise<net.Socket> {
    if (proxy) {
        const info = await SocksClient.createConnection({
            proxy,
            command: "connect",
            destination: {
                host, port
            },
        });

        return info.socket;
    }

    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        socket.once("error", reject);
        socket.once("connect", () => resolve(socket));
        socket.connect(port, host);
    });
}
