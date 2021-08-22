/* eslint-disable @typescript-eslint/ban-types */
import "reflect-metadata";
import { INCOMING_PACKETS } from "realmlib";
import { PacketHookInfo, Logger, LogLevel } from "..";

const packetHooks: PacketHookInfo[] = [];

/**
 * A method decorator used to hook packets received by the server.
 * Signature: `(packet: Packet, client: Client) => void`
 * 
 * When the packet type is received by a client, the `PluginManager` will call the decorated method.
 * As such, an instance of the method's class must be present in the PluginManager.
 * Use the `@Plugin` class decorator or `PluginManager.hookInstance`, otherwise the method will never be called.
 */
export function PacketHook(): MethodDecorator {
    return function (
        target: Object,
        propertyKey: string | symbol,
        descriptor: PropertyDescriptor
    ) {

        const className = target.constructor.name;
        const methodName = propertyKey.toString();

        const params: Function[] = Reflect.getMetadata("design:paramtypes", target, propertyKey);

        // Ensure there is a valid packet to hook
        const packetHook = INCOMING_PACKETS.find((value) => value.name == params[0].name);
        if (!packetHook) {
            Logger.log("Packet Hook", `${className}.${methodName} will never be called because it does not hook an incoming packet.`, LogLevel.Warning);
            return;
        }

        const packetType = new packetHook().type;

        packetHooks.push({
            className,
            methodName,
            packetType,
        });
    };
}

/**
 * Returns a copy of the hooks which have been loaded.
 */
export function getPacketHooks(): PacketHookInfo[] {
    return [...packetHooks];
}