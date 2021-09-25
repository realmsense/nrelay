import { ObjectData } from "realmlib";
import { Entity } from "./entity";

export class Enemy extends Entity {

    // TODO: what properties are shared with Player/Pet (Character/GameObject)

    constructor(objectData?: ObjectData) {
        super();

        if (objectData) {
            this.parseObjectData(objectData);
        }
    }
}