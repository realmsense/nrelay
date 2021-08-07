export interface RunOptions {
    /**
     * Attempt to automatically update xml resources for the latest version
     */
    update?: {
        enabled: boolean,
        force?: boolean,
        urls: {
            exalt_version: string,
            build_hash: string,
            objects_xml: string,
            tiles_xml: string,
        }
    };

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