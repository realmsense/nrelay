import { ObjectStatusData } from "realmlib";
import { Logger, LogLevel } from "../..";
import { _Entity } from "./entity";

export class _Pet extends _Entity {

    constructor(objectStatus?: ObjectStatusData) {
        super();

        if (objectStatus) {
            this.parsePetStatus(objectStatus);
        }
    }

    public parsePetStatus(objectStatus: ObjectStatusData): void {

        this.parseEntityStatus(objectStatus);

        for (const stat of objectStatus.stats) {

            switch (stat.type) {

                default:
                    break;
            }
        }
    }
}