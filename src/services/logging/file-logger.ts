import { WriteStream } from "fs";
import { LogLevel, LogProvider } from "./logger";

/**
 * A Logger that writes to a `WriteStream`.
 */
export class FileLogger implements LogProvider {

    /** Whether to prefix log messages with the LogLevel */
    public readonly levelPrefix: boolean;

    private readonly writeStream: WriteStream;

    constructor(logStream: WriteStream, levelPrefix = true) {
        this.writeStream = logStream;
        this.levelPrefix = levelPrefix;
    }

    public log(sender: string, message: string, level: LogLevel): void {
        const date = new Date().toISOString().substr(11, 8); // HH:MMM:SS
        let string = `[${date} | ${sender}]`.padEnd(30) + message;

        if (this.levelPrefix) {
            string = LogLevel[level].toUpperCase().padEnd(8) + string;
        }

        this.writeStream.write(string + "\n");
    }
}
