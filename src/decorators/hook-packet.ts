import "reflect-metadata";
import { PacketMap } from "realmlib";
import { VALID_PACKET_HOOKS } from ".";
import { HookInfo, Logger, LogLevel, HookParamType } from "..";

const hooks: HookInfo<any>[] = [];

/**
 * Indicates that the decorated method should be called when it's packet type is received by a client.
 */
export function PacketHook(): MethodDecorator {
    return (target, key) => {
        const params: Array<new (...args: any[]) => any> = Reflect.getMetadata("design:paramtypes", target, key) || [];
        const paramNames = params.map((param) => param.name);

        // find the packet parameter
        const packetParam = params.find((param) => VALID_PACKET_HOOKS.indexOf(param.name) !== -1);
        if (packetParam === undefined) {
            const desc = getDescription(target, key, paramNames);
            Logger.log(
                "PacketHook",
                `${desc} will never be called, because it does not hook an incoming packet.`,
                LogLevel.Warning,
            );
            return;
        }

        // work out the type signature
        const signature: HookParamType[] = params.map((param) => {
            if (param === packetParam) {
                return HookParamType.Packet;
            }
            switch (param.name) {
                case "Client":
                    return HookParamType.Client;
                default:
                    return HookParamType.Other;
            }
        });

        // warn if there are other params
        if (signature.some((arg) => arg === HookParamType.Other)) {
            const desc = getDescription(target, key, paramNames);
            Logger.log(
                "PacketHook",
                `${desc} has parameters that will always be undefined because their type is not Client or Packet.`,
                LogLevel.Warning,
            );
        }

        // get the type of the packet.
        const packetInstance: any = new packetParam();
        const packetId = packetInstance.id;
        const packetType = PacketMap[packetId];
        // sanity check.
        if (typeof packetType !== "string") {
            throw new Error(`Cannot get packet type of the packet "${packetParam.name}"`);
        }
        hooks.push({
            target: target.constructor.name,
            method: key.toString(),
            packet: packetType,
            signature,
        });
    };
}

/**
 * Returns a copy of the hooks which have been loaded.
 */
export function getHooks(): HookInfo<any>[] {
    return [...hooks];
}

// eslint-disable-next-line @typescript-eslint/ban-types
function getDescription(target: Object, key: string | symbol, params: string[]): string {
    let printedParams = params;
    if (params.length > 2) {
        printedParams = [...params.slice(0, 2), "..."];
    }
    return `${target.constructor.name}.${key.toString()}(${printedParams.join(", ")})`;
}
