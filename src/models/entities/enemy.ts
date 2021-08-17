import { ObjectStatusData } from "realmlib";
import { _Entity } from "./entity";

export class _Enemy extends _Entity {

    // TODO: what properties are shared with Player/Pet (Character/GameObject)

    constructor(objectStatus?: ObjectStatusData) {
        super();

        if (objectStatus) {
            this.parseStatus(objectStatus);
        }
    }

    public parseStatus(objectStatus: ObjectStatusData): void {
        this._parseStatus(objectStatus);
    }
}