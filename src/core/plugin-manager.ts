/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

import * as fs from "fs";
import { Packet } from "realmlib";
import { Client } from ".";
import { Runtime, Logger, LogLevel, getPlugins, PluginHookInfo, getPacketHooks, PluginInstance } from "..";

/**
 * Used to manage Plugins and PacketHooks
 */
export class PluginManager {

    public readonly runtime: Runtime;
    public readonly pluginInstances: PluginInstance[];

    constructor(runtime: Runtime) {
        this.runtime = runtime;
        this.pluginInstances = [];
    }

    /**
     * Load and instantiate all plugins during Runtime.
     * @param dir The directory containing the compiled plugins to load.
     */
    public async loadPlugins(dir: string): Promise<boolean> {
        
        if (!fs.existsSync(dir)) {
            Logger.log("Plugin Manager", `Failed to load plugins! Directory "${dir}" does not exist.`, LogLevel.Error);
            return false;
        }

        Logger.log("Plugin Manager", `Loading plugins from "${dir}"`, LogLevel.Debug);

        // Import plugins, so @Plugin and @PacketHook decorators are called
        const files = fs.readdirSync(dir);
        for (const file of files) {
            if (file.startsWith("index") || !file.endsWith(".js")) continue;
             
            const filePath = this.runtime.env.pathTo(dir, file);
            await import(filePath);
        }

        // Create load queue, oredered by required dependencies
        // Other option would be to instantiate the dependencies as they are required
        const loadQueue = getPlugins();
        loadQueue.sort((a, b) => {

            // if b depends on a, a should come first
            if (b.dependencies.includes(a.class))
                return -1;

            // if a depends on b, b come first
            if (a.dependencies.includes(b.class)) {
                return 1;
            }

            return 0;
        });

        // Instantiate Plugins
        for (const plugin of loadQueue) {
            if (!plugin.pluginInfo.instantiate) continue;
            if (!plugin.pluginInfo.enabled) continue;

            const instance = this.instantiatePlugin(plugin);
            if (!instance) {
                Logger.log("Plugin Manager", `Failed to load Plugin: ${plugin.pluginInfo.name}`, LogLevel.Error);
                continue;
            }
        }

        return true;
    }

    private instantiatePlugin(plugin: PluginHookInfo): any {

        // get required dependencies
        const dependencies: any[] = [];
        for (const dep of plugin.dependencies) {
            if (dep.name == Runtime.name) {
                dependencies.push(this.runtime);
                continue;
            }

            const instance = this.pluginInstances.find((value) => value.hookInfo.class.name == dep.name);
            if (!instance) {
                Logger.log("Plugin Manager", `Plugin "${plugin.pluginInfo.name}" depends on plugin "${dep.name}" which has not been loaded yet.`, LogLevel.Error);
                return null;
            }

            dependencies.push(instance);
        }

        const instance = new plugin.class(...dependencies);
        this.pluginInstances.push({
            instance,
            hookInfo: plugin,
        });
        
        Logger.log("Plugin Manager", `Instantiated Plugin "${plugin.pluginInfo.name}" by ${plugin.pluginInfo.author}`, LogLevel.Success);
        return instance;
    }

    /**
     * Used to hook a client's packetIO with all instantiated plugins, to call the required `@PacketHook` methods. 
     * @param client The client to hook it's PacketIO
     */
    public hookClient(client: Client): void {
        Logger.log("Plugin Manager", `Hooking packets from "${client.account.alias}"`);
        const hooks = getPacketHooks();
        for (const pluginInstance of this.pluginInstances) {
            const requiredHooks = hooks.filter((value) => value.className == pluginInstance.hookInfo.class.name);
            for (const hook of requiredHooks) {
                client.packetIO.on(hook.packetType.name, (packet: Packet) => {
                    const method = pluginInstance.instance[hook.methodName] as Function;
                    pluginInstance.instance[hook.methodName](packet, client);
                });
            }
        }
    }

    /**
     * Used to hook a client's packetIO with a Plugin instance that wasn't instantiated by this PluginManager.
     * @param client The client to hook it's PacketIO
     * @param instance An object that contains `@PacketHook` methods to hook
     */
    public hookInstance(client: Client, instance: unknown): void {
        const hooks = getPacketHooks();
        const requiredHooks = hooks.filter((value) => value.className == instance.constructor.name);
        for (const hook of requiredHooks) {
            client.packetIO.on(hook.packetType.name, (packet: Packet) => {
                instance[hook.methodName](packet, client);
            });
        }
    }
}
