// tslint:disable: max-classes-per-file

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
    static regex = /Account in use \((\d+) seconds? until timeout\)/;
    code = RuntimeErrorCodes.ACCOUNT_IN_USE;
    timeout: number;

    constructor(timeout: number) {
        super(`Account in use. ${timeout} seconds until timeout.`);
        this.timeout = timeout;
    }
}

export class AccountAlreadyManagedError extends Error {
    code = RuntimeErrorCodes.ACCOUNT_ALREADY_MANAGED;
    retry = false;

    constructor() {
        super(`This account is already managed by this runtime.`);
    }
}

export class NoProxiesAvailableError extends Error {
    code = RuntimeErrorCodes.NO_PROXIES_AVAILABLE;
    retry = false;

    constructor() {
        super(`No proxies available!`);
    }
}
