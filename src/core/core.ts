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
    update?: boolean;
    forceUpdate?: boolean;
    debug?: boolean;
    plugins?: boolean;
    logFile?: boolean;
    pluginPath?: string;
}
