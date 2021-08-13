import { Environment, Tile, GameObject, FILE_PATH, Logger, LogLevel, ProjectileInfo, RunOptions, VersionConfig } from "..";
import { HttpClient } from "../services/http-client";

/**
 * Loads and manages game resources.
 */
export class ResourceManager {

    public readonly env: Environment;
    public readonly tiles: { [id: number]: Tile };
    public readonly objects: { [id: number]: GameObject };
    public readonly items: { [id: number]: GameObject };
    public readonly enemies: { [id: number]: GameObject };
    public readonly pets: { [id: number]: GameObject };

    constructor(env: Environment) {
        this.env = env;
        this.tiles = {};
        this.objects = {};
        this.items = {};
        this.enemies = {};
        this.pets = {};
    }

    /**
     * Loads all available resources.
     */
    public async loadAllResources(): Promise<void> {
        await this.loadTileInfo();
        await this.loadObjects();
    }

    /**
     * Loads the GroundTypes resource.
     */
    public async loadTileInfo(): Promise<void> {
        const tilesXML = await this.env.readXML(FILE_PATH.TILES);
        const groundTypes = tilesXML.GroundTypes;

        // TODO: clean this up

        let tileArray: any[] = groundTypes.Ground;
        for (const tile of tileArray) {
            try {
                this.tiles[+tile.type] = {
                    type: +tile.type,
                    id: tile.id,
                    sink: (tile.Sink ? true : false),
                    speed: isNaN(tile.Speed) ? 1 : +tile.Speed,
                    noWalk: (tile.NoWalk ? true : false),
                    minDamage: (tile.MinDamage ? parseInt(tile.MinDamage, 10) : undefined),
                    maxDamage: (tile.MaxDamage ? parseInt(tile.MaxDamage, 10) : undefined),
                };
            } catch {
                Logger.log("Resource Manager", `Failed to load tile: ${tile.type}`, LogLevel.Debug);
            }
        }
        Logger.log("Resource Manager", `Loaded ${tileArray.length} tiles.`, LogLevel.Info);
        tileArray = null;
    }

    /**
     * Loads the Objects resource.
     */
    public async loadObjects(): Promise<void> {
        const objectsXML = await this.env.readXML(FILE_PATH.OBJECTS);
        const objects = objectsXML.Objects;

        let itemCount = 0;
        let enemyCount = 0;
        let petCount = 0;
        let objectsArray: any[] = objects.Object;
        for (const current of objectsArray) {
            if (this.objects[+current.type] !== undefined) {
                continue;
            }
            try {
                this.objects[+current.type] = {
                    type: +current.type,
                    id: current.id,
                    enemy: current.Enemy === "",
                    item: current.Item === "",
                    god: current.God === "",
                    pet: current.Pet === "",
                    slotType: isNaN(current.SlotType) ? 0 : +current.SlotType,
                    bagType: isNaN(current.BagType) ? 0 : +current.BagType,
                    class: current.Class,
                    maxHitPoints: isNaN(current.MaxHitPoints) ? 0 : +current.MaxHitPoints,
                    defense: isNaN(current.Defense) ? 0 : +current.Defense,
                    xpMultiplier: isNaN(current.XpMult) ? 0 : +current.XpMult,
                    activateOnEquip: [],
                    projectiles: [],
                    projectile: null,
                    rateOfFire: isNaN(current.RateOfFire) ? 0 : +current.RateOfFire,
                    numProjectiles: isNaN(current.NumProjectiles) ? 1 : +current.NumProjectiles,
                    arcGap: isNaN(current.ArcGap) ? 11.25 : +current.ArcGap,
                    fameBonus: isNaN(current.FameBonus) ? 0 : +current.FameBonus,
                    feedPower: isNaN(current.feedPower) ? 0 : +current.feedPower,
                    fullOccupy: current.FullOccupy === "",
                    occupySquare: current.OccupySquare === "",
                    protectFromGroundDamage: current.ProtectFromGroundDamage === "",
                    mpCost: isNaN(current.MpCost) ? null : +current.MpCost,
                    mpEndCost: isNaN(current.MpEndCost) ? null : +current.MpEndCost,
                    soulbound: (current.Soulbound) ? true : false,
                    usable: (current.Usable) ? true : false,
                    activate: []
                };
                if (Array.isArray(current.Projectile)) {
                    this.objects[+current.type].projectiles = new Array<ProjectileInfo>(current.Projectile.length);
                    for (let j = 0; j < current.Projectile.length; j++) {
                        this.objects[+current.type].projectiles[j] = {
                            id: +current.Projectile[j].id,
                            objectId: current.Projectile[j].ObjectId,
                            damage: isNaN(current.Projectile[j].Damage) ? 0 : +current.Projectile[j].Damage,
                            armorPiercing: current.Projectile[j].ArmorPiercing === "",
                            minDamage: isNaN(current.Projectile[j].MinDamage) ? 0 : +current.Projectile[j].MinDamage,
                            maxDamage: isNaN(current.Projectile[j].MaxDamage) ? 0 : +current.Projectile[j].MaxDamage,
                            speed: +current.Projectile[j].Speed,
                            lifetimeMS: +current.Projectile[j].LifetimeMS,
                            parametric: current.Projectile[j].Parametric === "",
                            wavy: current.Projectile[j].Wavy === "",
                            boomerang: current.Projectile[j].Boomerang === "",
                            multiHit: current.Projectile[j].MultiHit === "",
                            passesCover: current.Projectile[j].PassesCover === "",
                            frequency: isNaN(current.Projectile[j].Frequency) ? 0 : +current.Projectile[j].Frequency,
                            amplitude: isNaN(current.Projectile[j].Amplitude) ? 0 : +current.Projectile[j].Amplitude,
                            magnitude: isNaN(current.Projectile[j].Magnitude) ? 0 : +current.Projectile[j].Magnitude,
                            conditionEffects: [],
                        };
                        if (Array.isArray(current.Projectile[j].ConditionEffect)) {
                            for (const effect of current.Projectile[j].ConditionEffect) {
                                this.objects[+current.type].projectiles[j].conditionEffects.push({
                                    effectName: effect._,
                                    duration: effect.duration,
                                });
                            }
                        } else if (typeof current.Projectile[j].ConditionEffect === "object") {
                            this.objects[+current.type].projectiles[j].conditionEffects.push({
                                effectName: current.Projectile[j].ConditionEffect._,
                                duration: current.Projectile[j].ConditionEffect.duration,
                            });
                        }
                    }
                } else if (typeof current.Projectile === "object") {
                    this.objects[+current.type].projectile = {
                        id: +current.Projectile.id,
                        objectId: current.Projectile.ObjectId,
                        damage: isNaN(current.Projectile.damage) ? -1 : +current.Projectile.damage,
                        armorPiercing: current.Projectile.ArmorPiercing === "",
                        minDamage: isNaN(current.Projectile.MinDamage) ? -1 : +current.Projectile.MinDamage,
                        maxDamage: isNaN(current.Projectile.MaxDamage) ? -1 : +current.Projectile.MaxDamage,
                        speed: +current.Projectile.Speed,
                        lifetimeMS: +current.Projectile.LifetimeMS,
                        parametric: current.Projectile.Parametric === "",
                        wavy: current.Projectile.Wavy === "",
                        boomerang: current.Projectile.Boomerang === "",
                        multiHit: current.Projectile.MultiHit === "",
                        passesCover: current.Projectile.PassesCover === "",
                        frequency: isNaN(current.Projectile.Frequency) ? 1 : +current.Projectile.Frequency,
                        amplitude: isNaN(current.Projectile.Amplitude) ? 0 : +current.Projectile.Amplitude,
                        magnitude: isNaN(current.Projectile.Magnitude) ? 3 : +current.Projectile.Magnitude,
                        conditionEffects: [],
                    };
                    this.objects[+current.type].projectiles.push(this.objects[+current.type].projectile);
                }
                // map items.
                if (this.objects[+current.type].item) {
                    // stat bonuses
                    if (Array.isArray(current.ActivateOnEquip)) {
                        for (const bonus of current.ActivateOnEquip) {
                            if (bonus._ === "IncrementStat") {
                                this.objects[+current.type].activateOnEquip.push({
                                    statType: bonus.stat,
                                    amount: bonus.amount,
                                });
                            }
                        }
                    } else if (typeof current.ActivateOnEquip === "object") {
                        if (current.ActivateOnEquip._ === "IncrementStat") {
                            this.objects[+current.type].activateOnEquip.push({
                                statType: current.ActivateOnEquip.stat,
                                amount: current.ActivateOnEquip.amount,
                            });
                        }
                    }
                    this.items[+current.type] = this.objects[+current.type];
                    itemCount++;
                }
                // map enemies.
                if (this.objects[+current.type].enemy) {
                    this.enemies[+current.type] = this.objects[+current.type];
                    enemyCount++;
                }
                // map pets.
                if (this.objects[+current.type].pet) {
                    this.pets[+current.type] = this.objects[+current.type];
                    petCount++;
                }
            } catch {
                Logger.log("Resource Manager", `Failed to load object: ${current.type}`, LogLevel.Debug);
            }
        }
        Logger.log("Resource Manager", `Loaded ${objectsArray.length} objects.`, LogLevel.Info);
        Logger.log("Resource Manager", `Loaded ${itemCount} items.`, LogLevel.Debug);
        Logger.log("Resource Manager", `Loaded ${enemyCount} enemies.`, LogLevel.Debug);
        Logger.log("Resource Manager", `Loaded ${petCount} pets.`, LogLevel.Debug);
        objectsArray = null;
    }

    /**
     * Attempts to update Exalt resources (Objects, GroundTypes)
     * @param buildHash The current buildHash saved in versions.json
     * @param force Whether to force update regardless if buildHash is equal
     */
    public async updateResources(updateConfig: RunOptions["update"]): Promise<void> {

        const versionConfig: VersionConfig = this.env.readJSON(FILE_PATH.VERSIONS);

        const currentBuildHash = await HttpClient.request(updateConfig.urls.build_hash);
        if (!updateConfig.force && versionConfig.buildHash == currentBuildHash) {
            Logger.log("Resource Manager", "version.json is up to date.", LogLevel.Info);
            return;
        }
        
        Logger.log("Resource Manager", "version.json is out of date, attempting to automatically update resources...", LogLevel.Warning);
        Logger.log("Resource Manager", "You should check for a new update of nrelay or realmlib! (using the command git submodule update --recursive)", LogLevel.Warning);
        
        const exaltVersion = await HttpClient.request(updateConfig.urls.exalt_version);
        versionConfig.buildHash = currentBuildHash;
        versionConfig.exaltVersion = exaltVersion;

        const objects = await HttpClient.request(updateConfig.urls.objects_xml);
        this.env.writeFile(objects, FILE_PATH.OBJECTS);
        Logger.log("Resource Manager", "Updated objects.xml", LogLevel.Info);

        const tiles = await HttpClient.request(updateConfig.urls.tiles_xml);
        this.env.writeFile(tiles, FILE_PATH.TILES);
        Logger.log("Resource Manager", "Updated tiles.xml", LogLevel.Info);

        this.env.writeJSON(versionConfig, FILE_PATH.VERSIONS);
        Logger.log("Resource Manager", "Successfully updated Resources!", LogLevel.Success);
    }
}
