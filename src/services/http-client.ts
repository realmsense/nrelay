import axios, { AxiosRequestConfig, Method } from "axios";
import { Proxy } from "..";
import { Appspot } from "realmlib";
import { SocksProxyAgent } from "socks-proxy-agent";
import { URLSearchParams } from "url";

export type RequestHeaders = {
    [key: string]: string
}

/**
 * Static helper class to make HTTP requests
 */
export class HttpClient {

    /**
     * @param method The HTTP method to use
     * @param url The url of the host
     * @param params An object containing the URL parameters to be sent (e.g: `{ key: "value" }` )
     * @param data Request body data to be sent
     * @param proxy An optional Socks proxy to use
     * @param headers Custom headers to be sent
     * @param parseXMLError Checks whether the response data is an XML error (`<Error>message</Error>`) and throws an exception.
     */
    public static async request(method: Method, url: string, params?: unknown, data?: unknown, proxy?: Proxy, headers: RequestHeaders = {}): Promise<string> {
        
        const options: AxiosRequestConfig = {};
        options.method = method;
        options.url = url;
        options.params = params;
        options.data = data;
        options.headers = headers;
        this.setProxy(options, proxy);

        const response = await axios(options);
        return response.data;
    }

    public static AppspotHost = Appspot.Host.Production;

    public static async appspot<T extends keyof Appspot.Path>(path: T, params: Appspot.Path[T], proxy?: Proxy, checkXMLError = true): Promise<string> {
        const url = this.AppspotHost + path;

        const body = new URLSearchParams({
            ...params as any,
            "game_net"        : "Unity",
            "play_platform"   : "Unity",
            "game_net_user_id": "",
        });

        const response = await this.request("POST", url, null, body, proxy, UNITY_REQUEST_HEADERS);

        if (checkXMLError) {
            const error = parseXMLError(response);
            if (error) {
                throw error;
            }
        }

        return response;
    }

    private static setProxy(options: AxiosRequestConfig, proxy?: Proxy): void {
        if (!proxy) {
            return;
        }

        const agent = new SocksProxyAgent({
            host: proxy.host,
            port: proxy.port,
            type: proxy.type,
            userId: proxy.userId,
            password: proxy.password
        });

        options.httpAgent = agent;
        options.httpsAgent = agent;
    }
}

export function parseXMLError(message: string): Error | null {
    // <Error>some error</Error>
    const pattern = /<Error\/?>(.+)<\/?Error>/;
    const match = pattern.exec(message);
    if (match) {
        const error = new Error(match[1]);
        return error;
    }

    return null;
}

export const UNITY_REQUEST_HEADERS: RequestHeaders = {
    "User-Agent": "UnityPlayer/2019.3.14f1 (UnityWebRequest/1.0, libcurl/7.52.0-DEV)",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Unity-Version": "2019.3.14f1"
};