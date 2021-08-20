import { ObjectXML, ProjectileXML } from ".";
import { ObjectClass } from "./object-xml";

export interface EnemyXML extends ObjectXML{
    type: number,
    id: string,
    displayID: string,
    exp: number,
    maxHP: number,
    defense: number,
    class: ObjectClass,
    group: string,
    hero: boolean,
    god: boolean,
    invincible: boolean,
    immune: {
        statis: boolean,
        stun: boolean,
        paralyze: boolean,
        daze: boolean,
        slow: boolean,
    },
    projectiles: ProjectileXML[]
}