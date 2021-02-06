/**
 * Information about the versions of an nrelay project.
 */
export interface Versions {
    /**
     * The build hash used by this project.
     */
    buildHash: string;
    /**
     * The build version used by this project.
     */
    buildVersion: string;
    /**
     * The client token used by this project.
     */
    clientToken: string;
}
