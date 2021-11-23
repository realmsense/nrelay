import { ConditionEffect, ObjectData, ObjectStatusData, StatData, StatType, WorldPosData } from "realmlib";
import { Logger, LogLevel } from "../..";
import { IEntity } from "../../../shared/src";

export abstract class Entity implements IEntity {

    public objectID: number;
    public objectType: number;
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

    public parseObjectData(objectData: ObjectData): void {
        this.objectType = objectData.objectType;
        this.parseObjectStatus(objectData.status);
    }

    public parseObjectStatus(objectStatus: ObjectStatusData): void {
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