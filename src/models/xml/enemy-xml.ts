import { ProjectileXML } from "./projectile-xml";

export interface EnemyXML {
    type: number,
    id: string,
    displayID: string,
    exp: number,
    maxHP: number,
    defense: number,
    class: string, // "Character", etc
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