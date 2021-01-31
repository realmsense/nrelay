import { Client } from "./client";
import { Proxy } from "../models";
import { Environment } from "../runtime";

const PROXY_MAX_USES = 4;

export class ProxyPool {

    private proxies: Proxy[];
    private env: Environment;

    constructor(environment: Environment) {
        this.env = environment;
    }   

    /**
     * Loads the proxy list from ./src/nrelay/proxies.json
     */
    loadProxies() {
        let proxies = this.env.readJSON<Proxy[]>('src', 'nrelay', 'proxies.json');
        proxies.forEach((proxy, index) => proxy.uses = 0);
        this.proxies = proxies;
    }

    /**
     * Set a clients proxy
     * @param client The client to assign the proxy to
     * @param proxy The proxy to use
     */
    setProxy(client: Client, proxy: Proxy) {
        if (client.proxy) {
            this.removeProxy(client);
        }
        client.proxy = proxy;
        proxy.uses++;

        // client.connect();
    }

    deleteProxy(proxy: Proxy) {
        const index = this.proxies.indexOf(proxy);
        if (index != -1) {
            this.proxies.splice(index, 1);
        }
    }

    removeProxy(client: Client) {
        if (client.proxy) {
            client.proxy.uses--;
        }
        client.proxy = null;
    }

    getNextAvailableProxy() {
        for (let proxy of this.proxies) {
            if (proxy.uses < PROXY_MAX_USES)  {
                proxy.uses++;
                return proxy;
            }
        }

        return null;
    }
}