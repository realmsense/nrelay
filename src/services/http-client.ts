import axios, { AxiosRequestConfig, Method } from "axios";
import { SocksProxy } from "socks";
import { SocksProxyAgent } from "socks-proxy-agent";

/**
 * Static heper class to make HTTP requests (mostly for Appspot requests)
 */
export class HttpClient {

    /**
     * Send a new HTTP Request
     * @param url The url of the host
     * @param params A plain object containing the URL parameters to be sent (e.g: `{ key: "value" }` )
     * @param method The HTTP method to use, default is "GET"
     * @param proxy An optional Socks proxy to use
     * @param unityHeaders Whether to use the default Unity headers
     * @returns {string} The requests's response data
     */
    public static async request(url: string, params?: unknown, method: Method = "GET", proxy?: SocksProxy, parseXMLError = true, unityHeaders = true): Promise<string> {
        
        const options: AxiosRequestConfig = {};
        if (unityHeaders) {
            options.headers = UNITY_REQUEST_HEADERS;
        }

        options.url = url;
        options.params = params;
        options.method = method;

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
        return response.data;
    }
}

export const UNITY_REQUEST_HEADERS = {
    "User-Agent": "UnityPlayer/2019.4.21f1 (UnityWebRequest/1.0, libcurl/7.52.0-DEV)",
    "Accept": "*/*",
    "Accept-Encoding": "identity",
    "Content-Type": "application/x-www-form-urlencoded",
    "X-Unity-Version": "2019.4.21f1"
};

export namespace Appspot {
    export const HOST = "https://realmofthemadgod.appspot.com";

    export const LANGUAGE_STRINGS       = HOST + "/app/getLanguageStrings";
    export const CHAR_LIST              = HOST + "/char/list";
    export const SERVER_LIST            = HOST + "/account/servers";
    export const ACCOUNT_VERIFY         = HOST + "/account/verify";
    export const VERIFY_ACCESS_TOKEN    = HOST + "/account/verifyAccessTokenClient";
}