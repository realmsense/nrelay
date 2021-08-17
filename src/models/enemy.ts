import { ObjectStatusData } from "realmlib";
import { Entity } from "./entity";
import { GameObject, ConditionEffect } from ".";

/**
 * An enemy game object.
 */
export class Enemy extends Entity {
    /**
     * The properties of this enemy as described by the Objects resource.
     */
    public properties: GameObject;

    constructor(properties: GameObject, status: ObjectStatusData) {
        super(status);
        this.properties = properties;
    }

    /**
     * Calculates the amount of damage a bullet will apply to an enemy.
     * @param damage The amount of damage to apply.
     * @param armorPiercing Whether or not the damage is armor piercing.
     */
    public damage(damage: number, armorPiercing = false): number {

        // TODO: use updated ConditionEffect bits
        // this could probably be shared with Player/Enemy (Entity)
        // but doesn't apply to Pet so kinda weir
        return 0;

        // if (hasEffect(this.objectData.condition, ConditionEffect.INVINCIBLE | ConditionEffect.INVULNERABLE)) {
        //     return 0;
        // }

        // // work out the defense.
        // let def = this.objectData.def;
        // if (hasEffect(this.objectData.condition, ConditionEffect.ARMORED)) {
        //     def *= 2;
        // }
        // if (armorPiercing || hasEffect(this.objectData.condition, ConditionEffect.ARMORBROKEN)) {
        //     def = 0;
        // }

        // // work out the actual damage.
        // const min = damage * 3 / 20;
        // const actualDamage = Math.max(min, damage - def);
        // return actualDamage;
    }
}
