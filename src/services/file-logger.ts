import { WriteStream } from "fs";
import { LogLevel, LogProvider } from "./logger";
import * as stringUtils from "./string-utils";

/**
 * A logger which writes log messages to a `WriteStream`.
 */
export class FileLogger implements LogProvider {

    /** Whether to prefix the log's lines with the LogLevel */
    public readonly levelPrefix: boolean;
    private logStream: WriteStream;

    constructor(logStream: WriteStream, levelPrefix = true) {
        this.logStream = logStream;
        this.levelPrefix = levelPrefix;
    }

    public log(sender: string, message: string, level: LogLevel): void {
        const senderString = (`[${stringUtils.getTime()} | ${sender}]`);
        let printString = stringUtils.pad(senderString, 30) + message + "\n";

        if (this.levelPrefix) {
            let levelString = LogLevel[level] ?? "custom";
            levelString = stringUtils.pad(levelString.toUpperCase(), 8);
            printString = levelString.concat(printString);
        }

        this.logStream.write(printString);
    }
}
