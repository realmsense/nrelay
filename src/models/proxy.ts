import { SocksProxy } from "socks";

export type Proxy =
    Pick<SocksProxy, "host" | "port" | "userId" | "password" | "type">
    & {
        uses: {
            [serverName: string]: number;
        };
    };