import { SocksProxy } from "socks";
import { Environment, FILE_PATH, Account } from "..";

const PROXY_MAX_USES = 4;

export class ProxyPool {

    /**
     * A map of all the proxies and the number of uses
     */
    public readonly proxies: Map<SocksProxy, number>;

    private env: Environment;

    constructor(environment: Environment) {
        this.proxies = new Map();
        this.env = environment;
    }

    /**
     * Loads the proxy list from ./src/nrelay/proxies.json
     */
    public loadProxies(): void {
        const proxies = this.env.readJSON<SocksProxy[]>(FILE_PATH.PROXIES, true);
        for (const proxy of proxies) {
            this.addProxy(proxy);
        }
    }

    /**
     * Adds a proxy to the pool
     * @param proxy
     * @returns `true` if the proxy was sucessfully added, or `false` if the proxy already exists in the pool
     */
    public addProxy(proxy: SocksProxy): boolean {
        if (this.proxies.has(proxy)) {
            return false;
        }

        this.proxies.set(proxy, 0);
        return true;
    }

    /**
     * Removes a proxy from the pool
     * @return `true` if the proxy existed and has been removed, or `false` if the proxy does not exist. 
     */
    public deleteProxy(proxy: SocksProxy): boolean {
        return this.proxies.delete(proxy);
    }

    /**
     * Set an account's proxy
     * @param account The client to assign the proxy to
     * @param proxy The proxy to use
     */
    public setProxy(account: Account, proxy: SocksProxy): void {
        this.removeProxy(account);
        account.proxy = proxy;
        const uses = this.proxies.get(account.proxy) as number;
        this.proxies.set(account.proxy, uses + 1);
    }

    public removeProxy(account: Account): void {
        if (!account.proxy) return;
        const uses = this.proxies.get(account.proxy) as number;
        this.proxies.set(account.proxy, uses - 1);
        account.proxy = undefined;
    }

    public getNextAvailableProxy(): SocksProxy | null {
        for (const [proxy, uses] of this.proxies) {
            if (uses < PROXY_MAX_USES) {
                this.proxies.set(proxy, uses + 1);
                return proxy;
            }
        }
        return null;
    }
}
