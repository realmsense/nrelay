import { ObjectStatusData } from "realmlib";
import { Logger, LogLevel } from "../..";
import { _Entity } from "./entity";

export class _Pet extends _Entity {

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