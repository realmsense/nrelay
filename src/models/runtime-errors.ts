
export enum RuntimeErrorCodes {
    ACCOUNT_IN_USE,
    NO_PROXIES_AVAILABLE,
    ACCOUNT_ALREADY_MANAGED,
    ACCESS_TOKEN_RATE_LIMIT,
}

export interface RuntimeError extends Error {
    code: RuntimeErrorCodes;
    timeout?: number;
    retry?: boolean;
    regex?: RegExp;
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

export class AccountInUseError extends Error {
    public static regex = /Account in use \((\d+) seconds? until timeout\)/;
    public code = RuntimeErrorCodes.ACCOUNT_IN_USE;
    public timeout: number;

    constructor(timeout: number) {
        super(`Account in use. ${timeout} seconds until timeout.`);
        this.timeout = timeout;
    }
}

export class AccessTokenRateLimitError extends Error {

    // <Error>Internal error, please wait 5 minutes to try again!</Error>
    public static regex = /Internal error, please wait (\d+) minutes to try again!/;
    public code = RuntimeErrorCodes.ACCESS_TOKEN_RATE_LIMIT;
    public timeout: number;
    
    constructor(timeout: number) {
        super(`Failed to get AccessToken, we are being ratelimited for ${timeout/60} minutes.`);
        this.timeout = timeout;
    }
}

export function parseXMLError(message: string): Error {

    const accountInUse = AccountInUseError.regex.exec(message);
    if (accountInUse) {
        const timeout = parseInt(accountInUse[1]);
        const error = new AccountInUseError(timeout);
        return error;
    }

    const accessTokenRateLimit = AccessTokenRateLimitError.regex.exec(message);
    if (accessTokenRateLimit) {
        const timeout = parseInt(accessTokenRateLimit[1]) * 60; // in minutes
        const error = new AccessTokenRateLimitError(timeout);
        return error;
    }

    // <Error>some error</Error>
    const genericErrorRegex = /<Error\/?>(.+)<\/?Error>/;
    const otherError = genericErrorRegex.exec(message);
    if (otherError) {
        const error = new Error(otherError[1]);
        return error;
    }

    return undefined;
}