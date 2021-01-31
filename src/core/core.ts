import { Environment, Runtime } from '../';

// TODO
// This shit should be in a class
// So you could import runner from "nrelay"
// runner.run(options);
// or something like that

/**
 * Creates a new nrelay project.
 */
export async function create(): Promise<void> {

}

/**
 * "Fixes" an existing nrelay project by ensuring all of the required files exist.
 * This is pretty much just the `new` command, but with skip-if-exist logic.
 */
export async function fix(): Promise<void> {

}

/**
 * Updates the nrelay project with latest exalt resources
 */
async function update(): Promise<void> {

}

/**
 * Runs the nrelay project with the given arguments.
 * @param {RunOptions} options
 */
export async function start(options?: RunOptions): Promise<void> {

    if (typeof options == "undefined") {
        options = {};
    }

    // Set default value if option was not specified
    // options.update      = options.update || false;
    options.debug       = options.debug || false;
    options.plugins     = options.plugins !== false;
    options.logFile     = options.logFile || false;
    options.pluginPath  = options.pluginPath || './lib/plugins';

    const env = new Environment(process.cwd());
    const runtime = new Runtime(env);
    runtime.run(options);
}

export interface RunOptions {
    // update?: boolean;
    // forceUpdate?: boolean;
    debug?: boolean;
    plugins?: boolean;
    logFile?: boolean;
    pluginPath?: string;
}