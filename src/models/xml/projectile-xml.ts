import { ConditionEffectXML } from "./conditioneffect-xml";

export interface ProjectileXML {
    name: string,
    speed: number,
    damage: number,     
    size: number,
    lifetime: number,
    multiHit: boolean,
    conditionEffects: ConditionEffectXML[]
}