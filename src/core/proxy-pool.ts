import { SocksProxy } from "socks";
import { Client, Environment, FILE_PATH } from "..";

const PROXY_MAX_USES = 4;

export class ProxyPool {

    /**
     * A map of all the proxies and the number of uses
     */
    private proxies: Map<SocksProxy, number>;
    private env: Environment;

    constructor(environment: Environment) {
        this.env = environment;
    }

    /**
     * Loads the proxy list from ./src/nrelay/proxies.json
     */
    public loadProxies(): void {
        const proxies = this.env.readJSON<SocksProxy[]>(FILE_PATH.PROXIES);
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
    }

    /**
     * Removes a proxy from the pool
     * @return `true` if the proxy existed and has been removed, or `false` if the proxy does not exist. 
     */
    public deleteProxy(proxy: SocksProxy): boolean {
        return this.proxies.delete(proxy);
    }

    /**
     * Set a clients proxy
     * @param client The client to assign the proxy to
     * @param proxy The proxy to use
     */
    public setProxy(client: Client, proxy: SocksProxy): void {
        if (client.proxy) {
            this.removeProxy(client);
        }

        client.proxy = proxy;
        const uses = this.proxies.get(client.proxy);
        this.proxies.set(client.proxy, uses + 1);
    }

    public removeProxy(client: Client): void {
        if (client.proxy) {
            const uses = this.proxies.get(client.proxy);
            this.proxies.set(client.proxy, uses - 1);
        }

        client.proxy = null;
    }

    public getNextAvailableProxy(): SocksProxy {
        for (const [proxy, uses] of this.proxies) {
            if (uses < PROXY_MAX_USES) {
                this.proxies.set(proxy, uses + 1);
                return proxy;
            }
        }
        return null;
    }
}
