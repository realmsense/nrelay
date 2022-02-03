import { Runtime } from ".";
import { Account, Client, Logger, LogLevel } from "..";

export class ClientManager {

    private clients: Client[];
    
    private badAccounts: Account[];

    constructor() {
        this.clients = [];
        
        this.badAccounts = [];
    }

    public async loadClients(accounts: Account[], loadCount: number): Promise<void> {

        this.checkAccounts(accounts);

        loadCount = (loadCount == 0 ? accounts.length : loadCount);
        Logger.log("Client Manager", `Loading ${loadCount} accounts.`, LogLevel.Info);

        let loadOffset = 0;

        const loadAccount = async (account: Account) => {
            if (!account) return;

            const client = await this.loadClient(account);

            if (client) {
                this.clients.push(client);
            } else {
                // Account failed to load, load the next
                loadOffset++;
                const nextAccount = accounts[loadCount + loadOffset];
                if (nextAccount)
                    return loadAccount(nextAccount);
            }
        }

        // Load first X accounts
        for (let i = 0; i < loadCount; i++) {
            loadAccount(accounts[i]);
        }
    }

    /**
     * Performs a preliminary check of each account to ensure a `guid` and `password` is defined and there are no duplicates.
     * Bad accounts will be removed from the list
     */
    private checkAccounts(accounts: Account[]): void {

        Logger.log("Client Manager", "Checking account list...", LogLevel.Info);

        const goodAccounts: Account[] = [];

        while (accounts.length > 0) {

            const account = accounts.pop();
            if (!account) break;

            if (!account.guid || !account.password) {
                Logger.log("Client Manager", "Error loading the following account, a guid and password is required!", LogLevel.Error);
                Logger.log("Client Manager", JSON.stringify(account, undefined, 4), LogLevel.Error);
                this.badAccounts.push(account);
                continue;
            }

            const duplicate = accounts.find((value) => value.guid == account.guid || value.alias == account.alias);
            if (duplicate) {
                Logger.log("Client Manager", `Error loading account "${account.alias}" (guid: ${account.guid}), duplicate entry in accounts.json!`, LogLevel.Error);
                this.badAccounts.push(account);
                continue;
            }

            goodAccounts.push(account);
        }

        // Account list is now empty
        accounts.push(...goodAccounts);
    }

    private async loadClient(account: Account): Promise<Client |null> {

        // Set server preference
        let server = Runtime.serverList.servers.find((value) => account.info.serverPref == value.name || account.info.serverPref == value.address)
        if (!server) {
            server = Runtime.serverList.getRandomServer();
            Logger.log("Account", `[${account.alias}] Preferred server not found. Using ${server.name} instead.`, LogLevel.Warning);
        }

        account.server = server;

        // Set proxy
        if (account.info.usesProxy) {
            const success = Runtime.proxyPool.assignProxy(account, account.server.name);
            if (!success) {
                Logger.log("Client Manager", `[${account.alias}] Unable to load account, no proxies are available!`, LogLevel.Error);
                return null;
            }
        }

        const validTokens = await account.verifyTokens();
        if (!validTokens) {
            Logger.log("Client Manager", `[${account.alias}] Failed to validate access token, aborting!`, LogLevel.Error);
            return null;
        }

        await account.loadCharacterInfo(true);

        Logger.log("Client Manager", `Loaded "${account.alias}"`, LogLevel.Success);
        const client = new Client(account);
        this.clients.push(client);
        return client;
    }

    public removeClient(guid: string): boolean {
        const clientIdx = this.clients.findIndex((value) => value.account.guid == guid);
        const client = this.clients[clientIdx];

        if (!client) {
            Logger.log("Client Manager", `Failed to remove client "${guid}", no account was found with that guid`, LogLevel.Error);
            return false;
        }

        client.disconnect();
        Runtime.proxyPool.unassignProxy(client.account, client.server.name);
        this.clients.splice(clientIdx, 1);
        Logger.log("Client Manager", `Removed Client "${guid}" (${client.account.alias})`, LogLevel.Warning);
        return true;
    }
}