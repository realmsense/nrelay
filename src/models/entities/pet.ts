import { ObjectData } from "realmlib";
import { Entity } from ".";

export class Pet extends Entity {

    constructor(objectData: ObjectData) {
        super();

        if (objectData) {
            this.parseObjectData(objectData);
        }
    }
}