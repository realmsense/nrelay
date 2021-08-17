import { ObjectStatusData, StatData, StatType, WorldPosData } from "realmlib";
import { ConditionEffect, Logger, LogLevel } from "../..";

export class _Entity {

    public objectID: number;
    public pos: WorldPosData;

    public condition: [ConditionEffect, ConditionEffect];

    protected constructor() {
        this.condition = [0, 0];
    }

    public parseEntityStatus(objectStatus: ObjectStatusData): void {
        
        this.objectID = objectStatus.objectId;
        this.pos = objectStatus.pos;

        for (const stat of objectStatus.stats) {

            if (!(stat.type in StatType)) {
                Logger.log("Entity", `Unknown StatData with type: ${stat.type}`, LogLevel.Warning);
                Logger.log("Entity", JSON.stringify(stat, undefined, 4), LogLevel.Debug);
                continue;
            }

            switch (stat.type) {

                case StatType.CONDITION_STAT:
                    this.condition[0] = stat.value;
                    break;
                case StatType.NEW_CON_STAT:
                    this.condition[1] = stat.value;
                    break;

                default:
                    break;
            }
        }
    }
}