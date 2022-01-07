import axios, { AxiosRequestConfig, Method } from "axios";
import { Proxy } from "..";
import { SocksProxyAgent } from "socks-proxy-agent";

export type RequestHeaders = {
    [key: string]: string
}

/**
 * Static heper class to make HTTP requests (mostly for Appspot requests)
 */
export class HttpClient {

    /**
     * 
     * @param method The HTTP method to use
     * @param url The url of the host
     * @param params An object containing the URL parameters to be sent (e.g: `{ key: "value" }` )
     * @param data Request body data to be sent
     * @param proxy An optional Socks proxy to use
     * @param headers Custom headers to be sent
     * @param parseXMLError Checks whether the response data is an XML error (`<Error>message</Error>`) and throws an exception.
     */
    public static async request(method: Method, url: string, params?: unknown, data?: unknown, proxy?: Proxy, headers: RequestHeaders = {}, checkXMLError = true): Promise<string> {
        
        const options: AxiosRequestConfig = {};
        options.method = method;
        options.url = url;
        options.params = params;
        options.data = data;
        options.headers = headers;

        if (proxy) {
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

        const response = await axios(options);

        if (checkXMLError) {
            const error = parseXMLError(response.data);
            if (error) {
                throw error;
            }
        }

        return response.data;
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
    "User-Agent": "UnityPlayer/2019.4.21f1 (UnityWebRequest/1.0, libcurl/7.52.0-DEV)",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Unity-Version": "2019.4.21f1"
};

export namespace Appspot {
    export const HOST = "https://realmofthemadgod.appspot.com";

    export const APP_INIT               = HOST + "/app/init";
    export const LANGUAGE_STRINGS       = HOST + "/app/getLanguageStrings";
    export const CHAR_LIST              = HOST + "/char/list";
    export const SERVER_LIST            = HOST + "/account/servers";
    export const ACCOUNT_VERIFY         = HOST + "/account/verify";
    export const VERIFY_ACCESS_TOKEN    = HOST + "/account/verifyAccessTokenClient";
}