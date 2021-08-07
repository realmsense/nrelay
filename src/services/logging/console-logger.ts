import chalk from "chalk";
import { LogLevel, LogProvider } from "./logger";

/**
 * The default Logger, which logs to console.
 */
export class ConsoleLogger implements LogProvider {

    /**Log messages with a `LogLevel` below this will not be outputted. */
    private minLevel: LogLevel;
    
    constructor(minLevel = LogLevel.Info) {
        this.minLevel = minLevel;
    }

    public log(sender: string, message: string, level: LogLevel): void {
        // Level is numerically ascending
        if (level > this.minLevel) {
            return;
        }

        const date = new Date().toISOString().substr(11, 8); // HH:MMM:SS
        let string = `[${date} | ${sender}]`.padEnd(30) + message;

        // Colour
        switch (level) {

            case LogLevel.Error:
                string = chalk.red(string);
                break;
            case LogLevel.Warning:
                string = chalk.yellow(string);
                break;
            case LogLevel.Success:
                string = chalk.green(string);
                break;
            case LogLevel.Message:
                // default console colour
                break;
            case LogLevel.Info:
            case LogLevel.Debug:
                string = chalk.gray(string);
                break;
        }
        
        console.log(string);
    }
}
