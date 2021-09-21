import { ConditionEffect, SlotType } from "realmlib";
import { TileXML, EnemyXML, Environment, GameObject, FILE_PATH, Logger, LogLevel, ProjectileInfo, RunOptions, VersionConfig, HttpClient, ItemXML, ObjectXML, ProjectileXML } from "..";
import { PortalXML } from "../models/xml/portal-xml";

/**
 * Loads and manages game resources.
 */
export class ResourceManager {

    public readonly env : Environment;
    public readonly objects: { [id: number]: ObjectXML };
    public readonly tiles  : { [id: number]: TileXML };
    public readonly portals: { [id: number]: PortalXML };
    public readonly enemies: { [id: number]: EnemyXML };
    public readonly items  : { [id: number]: ItemXML };

    constructor(env: Environment) {
        this.env = env;
        this.objects = {};
        this.tiles = {};
        this.portals = {};
        this.enemies = {};
        this.items = {};
    }

    /**
     * Loads the GroundTypes resource.
     */
    public async loadTiles(): Promise<void> {
        const tilesXML = await this.env.readXML(FILE_PATH.TILES);
        const groundTypes = tilesXML.GroundTypes.Ground;

        for (const groundType of groundTypes) {
            const tile: TileXML = {
                type                  : parseInt(groundType["type"]),
                id                    : groundType["id"],
                noWalk                : "NoWalk" in groundType,
                sink                  : "Sink" in groundType,
                speed                 : groundType["Speed"] ? parseFloat(groundType["Speed"])      : 1.0,
                minDamage             : groundType["MinDamage"] ? parseInt(groundType["MinDamage"]): 0,
                maxDamage             : groundType["MaxDamage"] ? parseInt(groundType["MaxDamage"]): 0,
                conditionEffects      : [] as never,
                removeConditionEffects: [] as never,
            };

            // Condition effects
            const conditionEffects = this.assertArray(groundType["ConditionEffect"]);
            for (const conditionEffect of conditionEffects) {
                const effectName = (conditionEffect["_"] as string).toUpperCase();
                tile.conditionEffects.push({
                    effect  : ConditionEffect[effectName],
                    duration: conditionEffect["duration"]
                });
            }

            // Removed condition effects
            const removeConditionEffects: string[] = this.assertArray(groundType["RemoveConditionEffect"]);
            for (const effectName of removeConditionEffects) {
                tile.removeConditionEffects.push(ConditionEffect[effectName.toUpperCase()]);
            }

            this.tiles[tile.type] = tile;
        }

        Logger.log("Resource Manager", `Loaded ${Object.values(this.tiles).length} tiles.`, LogLevel.Info);
    }

    /**
     * Loads the Objects resource.
     */
    public async loadObjects(): Promise<void> {
        const objectsXML = await this.env.readXML(FILE_PATH.OBJECTS);
        const objects = objectsXML.Objects.Object;

        const classes = new Set<string>();

        for (const objectXML of objects) {

            const object: ObjectXML = {
                type        : parseInt(objectXML["type"]),
                id          : objectXML["id"],
                className       : objectXML["Class"],
                fullOccupy  : "FullOccupy" in objectXML,
                occupySquare: "OccupySquare" in objectXML,
            };

            if ("IntergamePortal" in objectXML) {
                const portal: PortalXML = {
                    ...object,
                    displayId  : objectXML["DisplayId"],
                    className      : objectXML["Class"],
                    dungeonName: objectXML["DungeonName"],
                };
                this.portals[portal.type] = portal;
            }

            // Handle Enemies
            if ("Enemy" in objectXML) {

                const enemy: EnemyXML = {
                    ...object,
                    displayID : objectXML["DisplayId"] || "",
                    exp       : objectXML["Exp"] || 0,
                    maxHP     : objectXML["MaxHitPoints"] || 0,
                    defense   : objectXML["Defense"] || 0,
                    group     : objectXML["Group"] || "",
                    hero      : "Hero" in objectXML,
                    god       : "God" in objectXML,
                    invincible: "Invincible" in objectXML,
                    immune    : {
                        statis  : "StasisImmune" in objectXML,
                        stun    : "StunImmune" in objectXML,
                        paralyze: "ParalyzeImmune" in objectXML,
                        daze    : "DazedImmune" in objectXML,
                        slow    : "SlowImmune" in objectXML,
                    },
                    projectiles: [],
                };

                // Enemy - projectiles
                const projectiles = this.assertArray(objectXML["Projectile"]);
                for (const projectileXML of projectiles) {
                    const projectile: ProjectileXML = {
                        name            : projectileXML["ObjectId"],
                        speed           : projectileXML["Speed"] || 100,
                        damage          : projectileXML["Damage"],
                        size            : projectileXML["Size"] || 100,
                        lifetime        : projectileXML["LifetimeMS"],
                        multiHit        : "MultiHit" in projectileXML,
                        conditionEffects: []
                    };

                    // Projectile - condition effects
                    const conditionEffects = this.assertArray(projectileXML["ConditionEffect"]);
                    for (const conditionEffect of conditionEffects) {
                        const effectName = (conditionEffect["_"] as string).toUpperCase();
                        projectile.conditionEffects.push({
                            effect  : ConditionEffect[effectName],
                            duration: conditionEffect["duration"],
                            target  : conditionEffect["target"] || 0
                        });
                    }

                    enemy.projectiles.push(projectile);
                }


                this.enemies[enemy.type] = enemy;
            }

            // TODO: Handle Pets
            // if ("Pet" in objectXML) {
            // }

            // Handle Items
            if ("Item" in objectXML) {

                // TODO: set deault values for undefined properties
                const item: ItemXML = {
                    ...objectXML,
                    displayID        : objectXML["DisplayId"],
                    slotType         : parseInt(objectXML["SlotType"]),
                    tier             : parseInt(objectXML["Tier"]),
                    description      : objectXML["Description"],
                    petFamily        : objectXML["PetFamily"],
                    doses            : objectXML["Doses"],
                    quantity         : objectXML["Quantity"],
                    cooldown         : objectXML["Cooldown"],
                    timer            : parseInt(objectXML["Timer"]),
                    addsQuickslot    : "AddsQuickslot" in objectXML,
                    backpack         : "Backpack" in objectXML,
                    teasure          : "Treasure" in objectXML,
                    mark             : "Mark" in objectXML,
                    petFood          : "PetFood" in objectXML,
                    potion           : "Potion" in objectXML,
                    consumable       : "Consumable" in objectXML,
                    bagType          : parseInt(objectXML["BagType"]),
                    feedPower        : parseInt(objectXML["feedPower"]),
                    xpBoost          : "XpBoost" in objectXML,
                    boostLootTier    : "LTBoosted" in objectXML,
                    boostLootDrop    : "LTBoosted" in objectXML,
                    mpCost           : objectXML["MpCost"],
                    mpCostPerSecond  : objectXML["MpCostPerSecond"],
                    mpEndCost        : objectXML["MpEndCost"],
                    multiPhase       : "MultiPhase" in objectXML,
                    dropTradable     : "DropTradable" in objectXML,
                    soulbound        : "Soulbound" in objectXML,
                    vaultItem        : "VaultItem" in objectXML,
                    invUse           : "InvUse" in objectXML,
                    usable           : "Usable" in objectXML,
                    forbidUseOnMaxHP : "ForbidUseOnMaxHP" in objectXML,
                    forbidUseOnMaxMP : "ForbidUseOnMaxMP" in objectXML,
                    track            : "Track" in objectXML,
                    uniqueID         : "UniqueID" in objectXML,
                    rateOfFire       : objectXML["RateOfFire"],
                    numProjectiles   : objectXML["NumProjectiles"],
                    arcGap           : objectXML["ArcGap"],
                    burstCount       : objectXML["BurstCount"],
                    burstDelay       : objectXML["BurstDelay"],
                    burstMinDelay    : objectXML["BurstMinDelay"],
                    projectiles      : [],
                    activate         : [],
                    activateOnEquip  : [],
                    activateOnAbility: [],
                    activateOnHit    : [],
                    activateOnShoot  : [],
                    conditionEffect  : [],
                    quickslot        : {
                        allowed : "QuickslotAllowed" in objectXML,
                        maxstack: objectXML["QuickslotAllowed"]?.["maxstack"] || 0
                    },
                };

                // Item - projectiles
                const projectiles = this.assertArray(objectXML["Projectile"]);
                for (const projectileXML of projectiles) {
                    const projectile: ProjectileXML = {
                        name            : projectileXML["ObjectId"],
                        speed           : projectileXML["Speed"] || 100,
                        damage          : projectileXML["Damage"],
                        size            : projectileXML["Size"] || 100,
                        lifetime        : projectileXML["LifetimeMS"],
                        multiHit        : "MultiHit" in projectileXML,
                        conditionEffects: []
                    };
                    item.projectiles.push(projectile);
                }

                // TODO: parse and type these properly
                // ActivateOnEquip
                // OnPlayerAbilityActivate
                // OnPlayerHitActivate
                // OnPlayerShootActivate
                item.activate          = objectXML["Activate"];
                item.activateOnEquip   = objectXML["ActivateOnEquip"];
                item.activateOnAbility = objectXML["OnPlayerAbilityActivate"];
                item.activateOnHit     = objectXML["OnPlayerHitActivate"];
                item.activateOnShoot   = objectXML["OnPlayerShootActivate"];
                item.conditionEffect   = objectXML["ConditionEffect"];

                this.items[item.type] = item;
            }

            this.objects[object.type] = object;
        }

        Logger.log("Resource Manager", `Loaded ${Object.keys(this.enemies).length} enemies`, LogLevel.Info);
        Logger.log("Resource Manager", `Loaded ${Object.keys(this.items).length} items`, LogLevel.Info);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private assertArray(obj: any): any[] {
        if (!obj) return [];

        if (!(obj instanceof Array)) {
            return [obj];
        }

        return obj;
    }

    /**
     * Attempts to update Exalt resources (Objects, GroundTypes)
     * @param buildHash The current buildHash saved in versions.json
     * @param force Whether to force update regardless if buildHash is equal
     */
    public async updateResources(updateConfig: RunOptions["update"]): Promise<void> {

        const versionConfig: VersionConfig = this.env.readJSON(FILE_PATH.VERSIONS);

        const currentBuildHash = await HttpClient.request("GET", updateConfig.urls.build_hash);
        if (!updateConfig.force && versionConfig.buildHash == currentBuildHash) {
            Logger.log("Resource Manager", "version.json is up to date.", LogLevel.Info);
            return;
        }

        Logger.log("Resource Manager", "version.json is out of date, attempting to automatically update resources...", LogLevel.Warning);
        Logger.log("Resource Manager", "You should check for a new update of nrelay or realmlib! (using the command git submodule update --recursive)", LogLevel.Warning);

        const exaltVersion = await HttpClient.request("GET", updateConfig.urls.exalt_version);
        versionConfig.buildHash = currentBuildHash;
        versionConfig.exaltVersion = exaltVersion;

        const objects = await HttpClient.request("GET", updateConfig.urls.objects_xml);
        this.env.writeFile(objects, FILE_PATH.OBJECTS);
        Logger.log("Resource Manager", "Updated objects.xml", LogLevel.Info);

        const tiles = await HttpClient.request("GET", updateConfig.urls.tiles_xml);
        this.env.writeFile(tiles, FILE_PATH.TILES);
        Logger.log("Resource Manager", "Updated tiles.xml", LogLevel.Info);

        this.env.writeJSON(versionConfig, FILE_PATH.VERSIONS);
        Logger.log("Resource Manager", "Successfully updated Resources!", LogLevel.Success);
    }
}
