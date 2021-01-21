import * as fs from 'fs';
import * as path from 'path';
import xml2js from "xml2js";

/**
 * The environment in which an nrelay project resides.
 *
 * This class is the API between the various files that nrelay uses (such as the packets and acc config etc)
 * and nrelay itself. Its goal is to provide a good abstraction for interacting with files and folders.
 */
export class Environment {

  /**
   * The root path of this environment. Generally, this
   * will be the folder which contains the nrelay project.
   */
  readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Creates a full path from the relative path provided.
   * @param relativePath The relative path to get.
   */
  pathTo(...relativePath: string[]): string {
    return path.join(this.root, ...relativePath);
  }

  /**
   * Creates a new directory in the root called `temp`.
   */
  mkTempDir(): void {
    try {
      fs.mkdirSync(this.pathTo('src', 'nrelay', 'temp'));
    } catch (error) {
      // if the dir already exists, don't worry.
      if (error.code !== 'EEXIST') {
        throw error;
      }
    }
  }

  /**
   * Deletes the `temp` directory.
   */
  rmTempDir(): void {
    function rm(dir: string): void {
      let files: string[];
      try {
        files = fs.readdirSync(dir);
      } catch (error) {
        if (error.code === 'ENOENT') {
          // the dir doesn't exist, so don't worry.
          return;
        } else {
          throw error;
        }
      }
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          rm(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      fs.rmdirSync(dir);
    }
    rm(this.pathTo('src', 'nrelay', 'temp'));
  }

  /**
   * Gets th
   * @param relativePath The relative path to the file.
   */
  readJSON<T>(...relativePath: string[]): T {
    try {
      const contents = this.readFileContents(...relativePath);
      if (!contents) {
        return undefined;
      }
      return JSON.parse(contents) as T;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // the file doesn't exist.
        return undefined;
      } else {
        // some other error.
        throw error;
      }
    }
  }

  async readXML(...relativePath: string[]): Promise<any> {
    const contents = this.readFileContents(...relativePath);
    return xml2js.parseStringPromise(contents, {mergeAttrs: true, explicitArray: false});
  }

  /**
   * Writes the JSON object into the specified file.
   * @param json The object to write.
   * @param relativePath The path of to the file to write to.
   */
  writeJSON<T>(json: T, ...relativePath: string[]): void {
    this.writeFile(JSON.stringify(json, undefined, 2), ...relativePath);
  }

  /**
   * Updates the object stored at the given path. This essentially
   * just calls `readJSON`, then updates the object, then calls `writeJSON`.
   * @param json The object to use when updating.
   * @param relativePath The path of the file to update.
   */
  updateJSON<T>(json: Partial<T>, ...relativePath: string[]): void {
    const existing: T = this.readJSON(...relativePath) || {} as T;
    for (const prop in json) {
      if (json.hasOwnProperty(prop)) {
        existing[prop] = json[prop];
      }
    }
    this.writeJSON(existing, ...relativePath);
  }

  writeFile<T>(data: T, ...relativePath: string[]) {
    const filePath = this.pathTo(...relativePath);
    fs.writeFileSync(filePath, data);
  }

  readFileContents(...relativePath: string[]): string {
    const filePath = this.pathTo(...relativePath);
    return fs.readFileSync(filePath, { encoding: 'utf8' });
  }
}
