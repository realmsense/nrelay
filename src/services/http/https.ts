import * as https from "https";
import * as qs from "querystring";
import * as url from "url";
import { HttpClient, REQUEST_HEADERS } from "./http-client";

/**
 * A class used internally by the `HttpClient` to work with https urls.
 *
 * @see HttpClient The `HttpClient` class should be used instead of this one.
 */
export class Https {
    /**
     * This method is used internally by the `HttpClient` class.
     *
     * **It is not recommended to use this method directly. Use `HttpClient.get` instead.**
     */
    public static get(path: string, query: string): Promise<string> {
        const opts: https.RequestOptions = {
            hostname: path,
            path: query,
            method: "GET",
            headers: REQUEST_HEADERS,
        };
        return new Promise((resolve, reject) => {
            const req = https.get(opts, (response) => {
                if (!response.statusCode.toString().startsWith("2")) {
                    reject(Error(`Failed to GET "https://${opts.hostname}${opts.path}". (Error ${response.statusCode})`));
                } else if (response.headers["content-encoding"] === "gzip") {
                    HttpClient.unzip(response).then(resolve, reject);
                } else {
                    const data: Buffer[] = [];
                    response.on("data", (chunk) => {
                        data.push(chunk as Buffer);
                    });
                    response.once("end", () => {
                        response.removeAllListeners("data");
                        response.removeAllListeners("error");
                        const str = Buffer.concat(data).toString();
                        resolve(str);
                    });
                    response.once("error", (error) => {
                        response.removeAllListeners("data");
                        response.removeAllListeners("end");
                        reject(error);
                    });
                }
            });
            req.end();
        });
    }

    /**
     * This method is used internally by the `HttpClient` class.
     *
     * **It is not recommended to use this method directly. Use `HttpClient.post` instead.**
     */
    public static post(endpoint: url.Url, params: { [id: string]: any }): Promise<string> {
        return new Promise((resolve: (data: string) => void, reject: (err: Error) => void) => {
            const postData = qs.stringify(params);
            const options = {
                host: endpoint.host,
                path: endpoint.path,
                method: "POST",
                headers: {
                    "User-Agent": "UnityPlayer/2019.4.9f1 (UnityWebRequest/1.0, libcurl/7.52.0-DEV)",
                    "X-Unity-Version": "2019.4.9f1",
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Content-Length": Buffer.byteLength(postData),
                },
            };
            const req = https.request(options, (response) => {
                response.setEncoding("utf8");
                let data = "";
                response.on("data", (chunk) => {
                    data += chunk;
                });
                response.once("end", () => {
                    response.removeAllListeners("data");
                    response.removeAllListeners("error");
                    resolve(data);
                });
                response.once("error", (error) => {
                    response.removeAllListeners("data");
                    response.removeAllListeners("end");
                    reject(error);
                });
            });
            req.write(postData);
            req.end();
        });
    }
}
