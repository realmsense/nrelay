import fs from "fs";
import path from "path";
import xml2js from "xml2js";
import AsyncLock from "async-lock";
import { Account, Logger, LogLevel } from "..";

/**
 * Helper class for interacting with the filesystem and nrelay resources.
 */
export class Environment {

    /**
     * The root path of this environment. Generally, this
     * will be the folder which contains the nrelay project.
     */
    public readonly rootPath: string;

    private readonly lock: AsyncLock;

    constructor(root?: string) {
        this.rootPath = root || process.cwd();
        this.lock = new AsyncLock();
    }

    /**
     * Returns the absolute path of a file/directory.
     * @param relativePath The relative path to use.
     */
    public pathTo(...relativePath: string[]): string {
        return path.join(this.rootPath, ...relativePath);
    }

    public acquireLock<T>(key: string | string[], fn: (() => T | PromiseLike<T>)): Promise<T> {
        // Ensure key is just a string; AsyncLock#acquire has a bug that will reverse the key if it is an Array.
        const _key = Array.isArray(key) ? key.join("") : key;
        return this.lock.acquire<T>(_key, fn);
    }

    /**
     * Reads the file and returns the contents. 
     * @param relativePath The relative path to the file.
     * @param throwError Should an error be thrown if an error occurred when reading the file.
     * @returns {string} The file's contents as a UTF-8 encoded string.
     */
    public readFile(relativePath: string[], throwError: true): string;
    public readFile(relativePath: string[], throwError?: boolean): string | null;
    public readFile(relativePath: string[], throwError?: boolean): string | null {
        const filePath = this.pathTo(...relativePath);

        try {
            return fs.readFileSync(filePath, { encoding: "utf8" });
        } catch (err) {
            const error = err as Error & { code: string };
            if (throwError) {
                Logger.log("Environment", `Error reading file "${filePath}". Error: ${error.code}`, LogLevel.Error);
                throw error;
            }

            return null;
        }
    }

    /**
     * Writes a string to the file. Creates the directory if required.
     * @param relativePath The relative path to the file.
     * @returns The absolute path of the file.
     */
    public writeFile(data: string, relativePath: string[]): string {
        const filePath = this.pathTo(...relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure directory exists.
        fs.writeFileSync(filePath, data);
        return filePath;
    }

    /**
     * Reads the file contents and returns the parsed JSON data.
     * @param relativePath The relative path to the file.
     * @param throwError Should an error be thrown if an error occurred when reading the file.
     */
    public readJSON<T>(relativePath: string[], throwError: true): T;
    public readJSON<T>(relativePath: string[]): T | null;
    public readJSON<T>(relativePath: string[], throwError?: true): T | null {
        const contents = this.readFile(relativePath, throwError);
        if (!contents) {
            return null as any;
        }
        return JSON.parse(contents);
    }

    /**
     * Writes a JSON object to a file.
     * @param json The object to write.
     * @param relativePath The relative path of the file.
     */
    public writeJSON(json: unknown, relativePath: string[]): void {
        const str = JSON.stringify(json, undefined, 4);
        this.writeFile(str, relativePath);
    }

    /**
     * Reads the file and returns the parsed XML data as a JSON object.
     * @param relativePath The relative path to the file.
     * @param throwError Should an error be thrown if an error occurred when reading the file.
     */
    public readXML<T = DefaultXML>(relativePath: string[], throwError: true): Promise<T>;
    public readXML<T = DefaultXML>(relativePath: string[]): Promise<T | null>;
    public readXML<T = DefaultXML>(relativePath: string[], throwError?: true): Promise<T | null> {
        const contents = this.readFile(relativePath, throwError);
        if (!contents) {
            return Promise.resolve(null) as any;
        }
        return xml2js.parseStringPromise(contents, { mergeAttrs: true, explicitArray: false }) as any;
    }
}

export namespace FILE_PATH {
    // root
    export const VERSIONS           = ["src", "nrelay", "versions.json"];
    export const ACCOUNTS           = ["src", "nrelay", "accounts.json"];
    export const PROXIES            = ["src", "nrelay", "proxies.json"];

    // resources
    export const OBJECTS            = ["src", "nrelay", "resources", "objects.xml"];
    export const TILES              = ["src", "nrelay", "resources", "tiles.xml"];

    // cache
    export const TOKEN_CACHE        = ["src", "nrelay", "cache", "token-cache.json"];
    export const CHAR_INFO_CACHE    = ["src", "nrelay", "cache", "char-info.json"];
    export const SERVERS_CACHE      = ["src", "nrelay", "cache", "servers.json"];
    export const LANGUAGE_STRINGS   = ["src", "nrelay", "cache", "language-strings.json"];

    // logs
    export const LOG_PATH           = ["src", "nrelay", "logs"];
}

export interface DefaultXML {
    [key: string]: any;
}
