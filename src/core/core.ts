import { Environment, Runtime } from "../";

// TODO
// This shit should be in a class
// So you could import runner from "nrelay"
// runner.run(options);
// or something like that

/**
 * Runs the nrelay project with the given arguments.
 * @param {RunOptions} options
 */
export async function start(options?: RunOptions): Promise<void> {

    if (typeof options === "undefined") {
        options = {};
    }

    // Set default value if option was not specified
    options.update      = options.update || false;
    options.forceUpdate = options.forceUpdate || false;
    options.debug       = options.debug || false;
    options.plugins     = options.plugins !== false;
    options.logFile     = options.logFile || false;
    options.pluginPath  = options.pluginPath || "./lib/plugins";
    options.censorGuid  = options.censorGuid !== false;

    const env = new Environment(process.cwd());
    const runtime = new Runtime(env);
    runtime.run(options);
}

export interface RunOptions {
    /**
     * Whether nrelay should attempt to automatically update to the latest Exalt version
     * 
     * `Default: false`
     */
    update?: boolean;
    /**
     * Whether nrelay should force update resources regardless they're already up to date
     * 
     * `Default: false`
     */
    forceUpdate?: boolean;
    /**
     * Set the minimum loglevel to "Debug"
     * 
     * `Default: false`
     */
    debug?: boolean;
    /**
     * Enable/disable plugin loading
     * 
     * `Default: true`
     */
    plugins?: boolean;
    /**
     * Whether to write all logs to `src/nrelay/nrelay-log.log`
     * 
     * `Default: false`
     */
    logFile?: boolean;
    /**
     * The directory to load plugins from
     * 
     * `Default: "./lib/plugins"`
     */
    pluginPath?: string;
    /**
     * Whether to censor clients' fallback alias (their guid)
     * 
     * `Default: true`
     */
    censorGuid?: boolean;
}
