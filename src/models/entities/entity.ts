import { ConditionEffect, ObjectStatusData, StatData, StatType, WorldPosData } from "realmlib";
import { Logger, LogLevel } from "../..";
import { IEntity } from "@realmsense/types";

export class Entity implements IEntity {

    public objectID: number;
    public pos: WorldPosData;
    public condition: [ConditionEffect, ConditionEffect];

    public status: ObjectStatusData;
    protected statMap: Map<StatType, (stat: StatData) => void>;

    protected constructor() {
        this.statMap = new Map();
        this.condition = [0, 0];

        this.statMap.set(StatType.NEW_CON_STAT,   (stat) => this.condition[0] = stat.value);
        this.statMap.set(StatType.CONDITION_STAT, (stat) => this.condition[1] = stat.value);
    }

    protected _parseStatus(objectStatus: ObjectStatusData): void {
        
        this.status = objectStatus;
        this.objectID = objectStatus.objectId;
        this.pos = objectStatus.pos;

        const remainingStats = [...objectStatus.stats];
        for (const stat of objectStatus.stats) {
            const func = this.statMap.get(stat.type);
            if (func) {
                func(stat);

                const index = remainingStats.indexOf(stat);
                if (index != -1) {
                    remainingStats.splice(index, 1);
                }
            }
        }

        for (const stat of remainingStats) {
            Logger.log("Entity", `Unparsed StatData: (${StatType[stat.type]}) ${JSON.stringify(stat)}`, LogLevel.Warning);
        }
    }
}