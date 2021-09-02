import { ObjectXML, ProjectileXML, ObjectClass } from ".";

export interface EnemyXML extends ObjectXML{
    type: number,
    id: string,
    displayID: string,
    exp: number,
    maxHP: number,
    defense: number,
    className: ObjectClass,
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