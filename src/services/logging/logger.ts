/**
 * 
 * Numerically descending LogLevels, from least important to most important.
 * A `LogProvider` may specify a minimum log level, to filter out some log
 * messages, such as Info or Debug messages.
 */
export enum LogLevel {
    Error,
    Warning,
    Success,
    Message,
    Info,
    Debug,
}

/**
 * An object used to handle new Log Messages.
 * Such as outputting to a file, or the console.
 * See `DefaultLogger` and `FileLogger`
 */
export interface LogProvider {
    log(sender: string, message: string, level: LogLevel): void;
}

/**
 * A static class for printing log messages to multiple `LogProviders`
 */
export class Logger {

    private static loggers: LogProvider[] = [];

    private constructor() { }

    /**
     * Adds a new logger to the logging chain.
     * @param logger 
     */
    public static addLogger(logger: LogProvider): void {
        this.loggers.push(logger);
    }
    /**
     * Clears the logging chain.
     */
    public static clearLoggers(): void {
        this.loggers = [];
    }

    /**
     * Logs a message to all LogProviders.
     * @param sender The sender of the message.
     * @param message The message.
     * @param level The level of the message.
     */
    public static log(sender: string, message: string, level: LogLevel = LogLevel.Message): void {
        for (const logger of this.loggers) {
            logger.log(sender, message, level);
        }
    }

    public static async printHeader(): Promise<void> {

        const nrelayVersion = (await import("../../../package.json")).version;

        const lines = [
            "-----",
            `version        :: ${nrelayVersion}`,
            `time           :: ${new Date().toISOString()}`,
            `directory      :: ${process.cwd()}`,
            "-----",
        ];

        for (const line of lines) {
            this.log("nrelay", line, LogLevel.Success);
        }
    }
}