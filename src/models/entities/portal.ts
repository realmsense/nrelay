import { ObjectData, StatType } from "realmlib";
import { Entity } from ".";
import { PortalXML } from "..";

export class Portal extends Entity {

    public xml: PortalXML;
    public name: string;
    public openedTime: number;

    constructor(objectData?: ObjectData, xml?: PortalXML) {
        super();

        this.statMap.set(StatType.HP_STAT,               (stat) => {});
        this.statMap.set(StatType.SIZE_STAT,             (stat) => {});
        this.statMap.set(StatType.ACTIVE_STAT,           (stat) => {});
        this.statMap.set(StatType.PROJECTILE_SPEED_MULT, (stat) => {});
        this.statMap.set(StatType.PROJECTILE_LIFE_MULT,  (stat) => {});
        this.statMap.set(StatType.UNKNOWN_123,           (stat) => {});
        this.statMap.set(StatType.NAME_STAT,             (stat) => this.name = stat.stringValue);
        this.statMap.set(StatType.OPENED_AT_TIMESTAMP,   (stat) => this.openedTime = stat.value);

        if (objectData) {
            this.parseObjectData(objectData);
        }

        if (xml) {
            this.xml = xml;
        }
    }
}