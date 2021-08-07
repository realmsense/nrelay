export interface VersionConfig {
    /**
     * The current build hash, used when updating resources
     */
    buildHash: string;

    /**
     * The current Exalt version. E.g. `1.3.1.0.0`
    */
    exaltVersion: string;

    /**
     * The platform token used by this project.
     * * Exalt: `8bV53M5ysJdVjU4M97fh2g7BnPXhefnc`
     * * Flash: `XTeP7hERdchV5jrBZEYNebAqDPU6tKU6`
     */
    platformToken: string;
}
