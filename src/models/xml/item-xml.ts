import { SlotType, PetFamily } from "realmlib";
import { ObjectXML, ProjectileXML, ObjectClass } from ".";

export interface ItemXML extends ObjectXML {
    type: number,
    id: string,
    displayID: string,
    class: ObjectClass,
    slotType: SlotType,
    tier: number,
    description: string
    petFamily: PetFamily,
    petFood: boolean,
    doses: number,
    quantity: number,
    cooldown: number,
    timer: number,
    addsQuickslot: boolean,
    backpack: boolean,
    teasure: boolean,
    mark: boolean,
    potion: boolean,
    consumable: boolean,
    bagType: number,// TODO: should be typed
    feedPower: number,
    xpBoost: boolean,
    boostLootTier: boolean,
    boostLootDrop: boolean,
    mpCost: number,
    mpCostPerSecond: number,
    mpEndCost: number,
    multiPhase: boolean,
    dropTradable: boolean,
    soulbound: boolean,
    vaultItem: boolean,
    invUse: boolean,
    usable: boolean,
    forbidUseOnMaxHP: boolean,
    forbidUseOnMaxMP: boolean,
    track: boolean,
    uniqueID: boolean,
    rateOfFire: number,
    numProjectiles: number,
    arcGap: number,
    burstCount: number,
    burstDelay: number,
    burstMinDelay: number,
    projectiles: ProjectileXML[],
    activate: [], // TODO: should be typed
    activateOnEquip: [],
    activateOnAbility: [],
    activateOnHit: [],
    activateOnShoot: [],
    conditionEffect: [],
    quickslot: {
        allowed: boolean,
        maxstack: 0
    }
}