import { WorldPosData } from "realmlib";
import { ObjectXML } from ".";

export interface MapObject extends ObjectXML {
    name: string
    objectId: number,
    pos: WorldPosData,
}