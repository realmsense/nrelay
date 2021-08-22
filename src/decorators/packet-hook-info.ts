import { PacketType } from "..";

/**
 * Used to store packet hooks when using the `PacketHook` decorator.
 * @see PluginManager
 */
export interface PacketHookInfo {
    className: string,
    methodName: string,
    packetType: PacketType,
}