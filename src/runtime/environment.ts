import fs from "fs";
import path from "path";
import xml2js from "xml2js";
import { Logger, LogLevel } from "..";

/**
 * Helper class for interacting with the filesystem and nrelay resources.
 */
export class Environment {

    /**
     * The root path of this environment. Generally, this
     * will be the folder which contains the nrelay project.
     */
    public readonly rootPath: string;

    constructor(root?: string) {
        this.rootPath = root || process.cwd();
    }

    /**
     * Returns the absolute path of a file/directory.
     * @param relativePath The relative path to use.
     */
    public pathTo(...relativePath: string[]): string {
        return path.join(this.rootPath, ...relativePath);
    }

    /**
     * Reads the file and returns the contents. 
     * @param relativePath The relative path to the file.
     * @returns {string} The file's contents as a UTF-8 encoded string.
     */
    public readFile(...relativePath: string[]): string {
        const filePath = this.pathTo(...relativePath);

        try {
            return fs.readFileSync(filePath, { encoding: "utf8" });
        } catch (error) {
            if (error.code == "ENOENT") {
                Logger.log("Enviornment", `Error reading file "${filePath}". File does not exist.`, LogLevel.Warning);
            } else {
                Logger.log("Enviornment", `Error reading file "${filePath}". Error:`, LogLevel.Error);
                throw error;
            }
            return undefined;
        }
    }

    /**
     * Writes a string to the file. Creates the directory if required.
     * @param relativePath The relative path to the file.
     * @returns The absolute path of the file.
     */
    public writeFile(data: string, ...relativePath: string[]): string {
        const filePath = this.pathTo(...relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true }); // Ensure directory exists.
        fs.writeFileSync(filePath, data);
        return filePath;
    }

    /**
     * Reads the file contents and returns the parsed JSON data.
     * @param relativePath The relative path to the file.
     */
    public readJSON<T>(...relativePath: string[]): T {
        const contents = this.readFile(...relativePath);
        if (!contents) {
            return undefined;
        }
        return JSON.parse(contents) as T;
    }

    /**
     * Writes a JSON object to a file.
     * @param json The object to write.
     * @param relativePath The relative path of the file.
     */
    public writeJSON(json: unknown, ...relativePath: string[]): void {
        const str = JSON.stringify(json, undefined, 4);
        this.writeFile(str, ...relativePath);
    }

    /**
     * Reads the file and returns the parsed XML data as a JSON object.
     * @param relativePath The relative path to the file.
     */
    public readXML(...relativePath: string[]): Promise<any> {
        const contents = this.readFile(...relativePath);
        return xml2js.parseStringPromise(contents, { mergeAttrs: true, explicitArray: false });
    }
}

export namespace FILE_PATH {
    // root
    export const VERSIONS        = "src/nrelay/versions.json";
    export const ACCOUNTS        = "src/nrelay/accounts.json";
    export const PROXIES         = "src/nrelay/proxies.json";

    // resources
    export const OBJECTS         = "src/nrelay/resources/objects.xml";
    export const TILES           = "src/nrelay/resources/tiles.xml";

    // cache
    export const CHAR_INFO_CACHE = "src/nrelay/cache/char-info.json";
    export const SERVERS_CACHE   = "src/nrelay/cache/servers.json";

    // logs
    export const LOG_FILE        = "src/nrelay/logs/nrelay.log";
}