import { ObjectStatusData } from "realmlib";
import { Entity } from ".";

export class Pet extends Entity {

    constructor(objectStatus?: ObjectStatusData) {
        super();

        if (objectStatus) {
            this._parseStatus(objectStatus);
        }
    }

    public parseStatus(objectStatus: ObjectStatusData): void {
        this._parseStatus(objectStatus);
    }
}