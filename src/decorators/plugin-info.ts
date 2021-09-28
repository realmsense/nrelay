/* eslint-disable @typescript-eslint/ban-types */

/**
 * A description of a plugin, used in the `@Plugin` decorator
 */
export interface PluginInfo {
    name: string;
    author: string;
    description?: string;

    /**
     * Default true, set to false to disable loading of the plugin
     */
    enabled?: boolean;

    /**
     * Whether the `PluginManager` should instantiate the decorated class.
     * If this is set to false, the class must call `PluginManager.addInstance` itself in order for it's `PacketHook`'s to work.
     * Default: true
     */
    instantiate?: boolean;
}

/**
 * Used to store packet hooks when using the `PacketHook` decorator.
 * @see PluginManager
 */
export interface PluginHookInfo {
    pluginInfo: PluginInfo,
    class: new (...args: unknown[]) => unknown,
    dependencies: Function[]
}

/**
 * @see PluginManager.pluginInstances
 */
export interface PluginInstance {
    hookInfo: PluginHookInfo,
    instance: Object
}