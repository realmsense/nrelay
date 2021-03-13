
export enum RuntimeErrorCodes {
    ACCOUNT_IN_USE,
    NO_PROXIES_AVAILABLE,
    ACCOUNT_ALREADY_MANAGED,
}

export interface RuntimeError extends Error {
    code: RuntimeErrorCodes;
    timeout?: number;
    retry?: boolean;
    regex?: RegExp;
}

export class AccountInUseError extends Error {
    public static regex = /Account in use \((\d+) seconds? until timeout\)/;
    public code = RuntimeErrorCodes.ACCOUNT_IN_USE;
    public timeout: number;

    constructor(timeout: number) {
        super(`Account in use. ${timeout} seconds until timeout.`);
        this.timeout = timeout;
    }
}

export class AccountAlreadyManagedError extends Error {
    public code = RuntimeErrorCodes.ACCOUNT_ALREADY_MANAGED;
    public retry = false;

    constructor() {
        super("This account is already managed by this runtime.");
    }
}

export class NoProxiesAvailableError extends Error {
    public code = RuntimeErrorCodes.NO_PROXIES_AVAILABLE;
    public retry = false;

    constructor() {
        super("No proxies available!");
    }
}
