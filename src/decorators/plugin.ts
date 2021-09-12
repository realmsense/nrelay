/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */

import "reflect-metadata";
import { PluginHookInfo, PluginInfo } from "./plugin-info";

const plugins: PluginHookInfo[] = [];

/**
 * Indicates that the decorated class is a Plugin which may contain packet hooks.
 * @param info The plugin information.
 */
export function Plugin(info: PluginInfo): ClassDecorator {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    return (target) => {

        const params: Function[] = Reflect.getMetadata("design:paramtypes", target) || [];

        info.enabled ??= true;
        info.instantiate ??= true;

        plugins.push({
            pluginInfo: info,
            class: target as any,
            dependencies: params
        });
    };
}

/**
 * @returns A copy of the plugins array, containing all classes that use the @Plugin decorator.
 */
export function getPlugins(): PluginHookInfo[] {
    return [...plugins];
}
