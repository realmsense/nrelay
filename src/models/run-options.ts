export interface RunOptions {
    /**
     * Attempt to automatically update xml resources for the latest version
     * `Default: false`
     */
    update?: boolean;
    /**
     * Forcibly update xml resources, regardless if the build version is already up to date.
     * `Default: false`
     */
    forceUpdate?: boolean;
    /**
     * Enable debug messages to be logged
     * `Default: false`
     */
    debug?: boolean;
    /**
     * Whether to load plugins or not
     * `Default: true`
     */
    plugins?: boolean;
    /**
     * Whether to write logs to `src/nrelay/nrelay-log.log`
     * `Default: false`
     */
    logFile?: boolean;
    /**
     * The directory to load plugins from
     * `Default: "./dist/plugins"`
     */
    pluginPath?: string;
}