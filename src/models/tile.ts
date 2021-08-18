import { ConditionEffect, WorldPosData } from "realmlib";

/**
 * A game tile.
 */
export interface Tile {
    /** ID of the tile */
    type: number;

    /** Name of the tile */
    id: string;

    /** The tile's position on the map, will be undefined unless set from `UpdatePacket` */
    pos?: {
        x: number,
        y: number
    };

    /** Whether the tile is walkable or not */
    noWalk: boolean;

    /** Whether the client sinks in this tile */
    sink: boolean;

    /** The speed multiplier of the tile */
    speed: number;

    /** Minimum damage this tile can inflict */
    minDamage: number;

    /** Maximum damage this tile can inflict */
    maxDamage: number;

    /** The condition effect applied to the client when walking on the tile */
    conditionEffects: [
        {
            effect: ConditionEffect,
            duration: number
        }
    ]

    /** The condition effects removed to the client when walking on the tile */
    removeConditionEffects: [
        string[]
    ]
}
