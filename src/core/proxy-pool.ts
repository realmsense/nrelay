import { Account, Environment, FILE_PATH, Logger, LogLevel, Proxy } from "..";

const PROXY_MAX_USES = 3; // 3 clients per server

export class ProxyPool {

    public readonly proxies: Proxy[];

    private env: Environment;

    constructor(environment: Environment) {
        this.proxies = [];
        this.env = environment;

        this.loadProxies();
    }

    /**
     * Loads the proxy list from ./src/nrelay/proxies.json
     */
    public loadProxies(): void {
        const proxies = this.env.readJSON<Proxy[]>(FILE_PATH.PROXIES, true);
        Logger.log("Proxy Pool", `Loading ${proxies.length} proxies.`, LogLevel.Success);
        for (const proxy of proxies) {
            this.addProxy(proxy);
        }
    }

    /**
     * @returns if `proxy` exists in the pool.
     */
    public hasProxy(proxy: Proxy): boolean {
        // Can't simply compare objects as Proxy#uses may be different.
        return this.proxies.find((value) => 
            value.host == proxy.host
            && value.port == proxy.port
            && value.userId == proxy.userId
            && value.password == proxy.password
        ) != null;
    }

    /**
     * Adds a proxy to the pool
     * @returns `true` if the proxy was sucessfully added, or `false` if the proxy already exists in the pool
     */
    public addProxy(proxy: Proxy): boolean {
        if (this.hasProxy(proxy)) {
            return false;
        }

        proxy.uses = {};
        this.proxies.push(proxy);
        return true;
    }

    /**
     * Removes a proxy from the pool
     * @return `true` if the proxy existed and has been removed, or `false` if the proxy does not exist. 
     */
    public deleteProxy(proxy: Proxy): boolean {
        const index = this.proxies.findIndex((value) => value == proxy);
        if (index == -1) {
            return false;
        }

        this.proxies.splice(index, 1);
        return true;
    }

    /**
     * Assing an available proxy for the client
     * @returns `true` if a proxy was successfully assigned to the client. `false` if no proxies were available.
     */
    public assignProxy(account: Account, serverName: string): boolean {
        for (const proxy of this.proxies) {
            proxy.uses[serverName] ??= 0;
            if (proxy.uses[serverName] >= PROXY_MAX_USES) {
                continue;
            }

            proxy.uses[serverName]++;
            account.proxy = proxy;
            return true;
        }

        return false;
    }

    /**
     * Remove a proxy from the client
     */
    public unassignProxy(account: Account, serverName: string): void {
        if (!account.proxy) return;

        if (account.proxy.uses[serverName] != undefined)
            account.proxy.uses[serverName]--;
        
        account.proxy = undefined;
    }
    
    /**
     * @returns A random proxy from the pool. May be in use by multiple clients. Returns `null` if there are no proxies in the pool.
     */
    public getRandomProxy(): Proxy | undefined {
        if (this.proxies.length == 0) {
            return undefined;
        }
        
        const index = this.proxies.length * Math.random() | 0; // https://stackoverflow.com/a/38448710/16999526
        return this.proxies[index];
    }
}
