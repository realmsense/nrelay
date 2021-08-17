import { ObjectStatusData, StatType } from "realmlib";
import { _Entity } from ".";
import { GuildRank } from "..";
import { Logger, LogLevel } from "../..";
import { ConditionEffect } from "../condition-effect";

export class _Player extends _Entity {

    // Account Data
    public name: string;
    public nameChosen: boolean;
    public accountID: number;
    public playerID: number;
    public supporter: boolean;
    public supporterPoints: number;
    public numStars: number;
    public accountFame: number;
    public credits: number;
    public fortuneToken: number;
    public currentFame: number;
    public legendaryRank: number;

    public forgeFire: number;
    public _119: number; // blueprints possibly?

    // XP
    public level: number;
    public exp: number;
    public nextLevelExp: number;
    public nextClassQuestFame: number;
    public xpBoosted: number;
    public xpTimer: number;
    public lootDropTimer: number;
    public lootTierTimer: number;

    // Guild
    public guildName: string;
    public guildRank: GuildRank;

    // Stats
    public maxHP: number;
    public hp: number;
    public maxMP: number;
    public mp: number;
    public dexterity: number;
    public attack: number;
    public defense: number;
    public vitality: number;
    public wisdom: number;
    public speed: number;

    // Stats - boost
    public boostMaxMP: number;
    public boostMaxHP: number;
    public boostDexterity: number;
    public boostAttack: number;
    public boostDefense: number;
    public boostSpeed: number;
    public boostVitality: number;
    public boostWisdom: number;

    public projectileSpeed: number;
    public projectileLife: number;

    // Stats - exalts
    public exaltedBonusDamage: number;
    public exaltedHP: number;
    public exaltedMP: number;
    public exaltedDexterity: number;
    public exaltedAttack: number;
    public exaltedDefense: number;
    public exaltedSpeed: number;
    public exaltedVitality: number;
    public exaltedWisdom: number;

    // Inventory
    public potions: number[];
    public inventory: number[];
    public hasBackpack: boolean;
    public backpack: number[];

    // Sprite
    public size: number;
    public texture: number;
    public tex1: number;
    public tex2: number;

    constructor(objectStatus?: ObjectStatusData) {
        super();

        this.potions = [-1, -1, -1];
        this.inventory = [-1, -1, -1 - 1, -1, -1, -1 - 1, -1, -1, -1, -1]; // 4 weapons + 8 slots
        this.backpack = [-1, -1, -1 - 1, -1, -1, -1, -1]; // 8

        // Account Data
        this.statMap.set(StatType.NAME_CHOSEN_STAT,      (stat) => this.nameChosen = !!stat.value);
        this.statMap.set(StatType.NAME_STAT,             (stat) => this.name = stat.stringValue);
        this.statMap.set(StatType.ACCOUNT_ID_STAT,       (stat) => this.accountID = stat.value);
        this.statMap.set(StatType.PLAYER_ID,             (stat) => this.playerID = stat.value);
        this.statMap.set(StatType.SUPPORTER_STAT,        (stat) => this.supporter = !!stat.value);
        this.statMap.set(StatType.SUPPORTER_POINTS_STAT, (stat) => this.supporterPoints = stat.value);
        this.statMap.set(StatType.NUM_STARS_STAT,        (stat) => this.numStars = stat.value);
        this.statMap.set(StatType.FAME_STAT,             (stat) => this.accountFame = stat.value);
        this.statMap.set(StatType.CREDITS_STAT,          (stat) => this.credits = stat.value);
        this.statMap.set(StatType.FORTUNE_TOKEN_STAT,    (stat) => this.fortuneToken = stat.value);
        this.statMap.set(StatType.CURR_FAME_STAT,        (stat) => this.currentFame = stat.value);
        this.statMap.set(StatType.LEGENDARY_RANK_STAT,   (stat) => this.legendaryRank = stat.value);

        this.statMap.set(StatType.UNKNOWN_119,           (stat) => this._119 = stat.value);
        this.statMap.set(StatType.FORGE_FIRE,            (stat) => this.forgeFire = stat.value);

        // XP
        this.statMap.set(StatType.LEVEL_STAT,                 (stat) => this.level = stat.value);
        this.statMap.set(StatType.EXP_STAT,                   (stat) => this.exp = stat.value);
        this.statMap.set(StatType.NEXT_LEVEL_EXP_STAT,        (stat) => this.nextLevelExp = stat.value);
        this.statMap.set(StatType.NEXT_CLASS_QUEST_FAME_STAT, (stat) => this.nextClassQuestFame = stat.value);
        this.statMap.set(StatType.XP_BOOSTED_STAT,            (stat) => this.xpBoosted = stat.value);
        this.statMap.set(StatType.XP_TIMER_STAT,              (stat) => this.xpTimer = stat.value);
        this.statMap.set(StatType.LD_TIMER_STAT,              (stat) => this.lootDropTimer = stat.value);
        this.statMap.set(StatType.LT_TIMER_STAT,              (stat) => this.lootTierTimer = stat.value);

        // Guild
        this.statMap.set(StatType.GUILD_NAME_STAT, (stat) => this.guildName = stat.stringValue);
        this.statMap.set(StatType.GUILD_RANK_STAT, (stat) => this.guildRank = stat.value);

        // Stats
        this.statMap.set(StatType.MAX_HP_STAT,    (stat) => this.maxHP = stat.value);
        this.statMap.set(StatType.HP_STAT,        (stat) => this.hp = stat.value);
        this.statMap.set(StatType.MAX_MP_STAT,    (stat) => this.maxMP = stat.value);
        this.statMap.set(StatType.MP_STAT,        (stat) => this.mp = stat.value);
        this.statMap.set(StatType.DEXTERITY_STAT, (stat) => this.dexterity = stat.value);
        this.statMap.set(StatType.ATTACK_STAT,    (stat) => this.attack = stat.value);
        this.statMap.set(StatType.DEFENSE_STAT,   (stat) => this.defense = stat.value);
        this.statMap.set(StatType.VITALITY_STAT,  (stat) => this.vitality = stat.value);
        this.statMap.set(StatType.WISDOM_STAT,    (stat) => this.wisdom = stat.value);
        this.statMap.set(StatType.SPEED_STAT,     (stat) => this.speed = stat.value);

        // Stats - boost
        this.statMap.set(StatType.MAX_MP_BOOST_STAT,     (stat) => this.maxMP = stat.value);
        this.statMap.set(StatType.MAX_HP_BOOST_STAT,     (stat) => this.maxHP = stat.value);
        this.statMap.set(StatType.DEXTERITY_BOOST_STAT,  (stat) => this.boostDexterity = stat.value);
        this.statMap.set(StatType.ATTACK_BOOST_STAT,     (stat) => this.boostAttack = stat.value);
        this.statMap.set(StatType.DEFENSE_BOOST_STAT,    (stat) => this.boostDefense = stat.value);
        this.statMap.set(StatType.SPEED_BOOST_STAT,      (stat) => this.boostSpeed = stat.value);
        this.statMap.set(StatType.VITALITY_BOOST_STAT,   (stat) => this.boostVitality = stat.value);
        this.statMap.set(StatType.WISDOM_BOOST_STAT,     (stat) => this.boostWisdom = stat.value);
        this.statMap.set(StatType.PROJECTILE_SPEED_MULT, (stat) => this.projectileSpeed = stat.value);
        this.statMap.set(StatType.PROJECTILE_LIFE_MULT,  (stat) => this.projectileLife = stat.value);

        // Stats - exalts
        this.statMap.set(StatType.EXALTATION_BONUS_DAMAGE, (stat) => this.exaltedBonusDamage = stat.value);
        this.statMap.set(StatType.EXALTED_HP,    (stat) => this.exaltedHP = stat.value);
        this.statMap.set(StatType.EXALTED_MP,    (stat) => this.exaltedMP = stat.value);
        this.statMap.set(StatType.EXALTED_DEX,   (stat) => this.exaltedDexterity = stat.value);
        this.statMap.set(StatType.EXALTED_ATT,   (stat) => this.exaltedAttack = stat.value);
        this.statMap.set(StatType.EXALTED_DEF,   (stat) => this.numStars = stat.value);
        this.statMap.set(StatType.EXALTED_SPEED, (stat) => this.exaltedSpeed = stat.value);
        this.statMap.set(StatType.EXALTED_VIT,   (stat) => this.exaltedVitality = stat.value);
        this.statMap.set(StatType.EXALTED_WIS,   (stat) => this.exaltedWisdom = stat.value);

        // Inventory
        this.statMap.set(StatType.POTION_0_TYPE, (stat) => this.potions[0] = stat.value);
        this.statMap.set(StatType.POTION_1_TYPE, (stat) => this.potions[1] = stat.value);
        this.statMap.set(StatType.POTION_2_TYPE, (stat) => this.potions[2] = stat.value);

        this.statMap.set(StatType.INVENTORY_0_STAT,  (stat) => this.inventory[0] = stat.value);
        this.statMap.set(StatType.INVENTORY_1_STAT,  (stat) => this.inventory[1] = stat.value);
        this.statMap.set(StatType.INVENTORY_2_STAT,  (stat) => this.inventory[2] = stat.value);
        this.statMap.set(StatType.INVENTORY_3_STAT,  (stat) => this.inventory[3] = stat.value);
        this.statMap.set(StatType.INVENTORY_4_STAT,  (stat) => this.inventory[4] = stat.value);
        this.statMap.set(StatType.INVENTORY_5_STAT,  (stat) => this.inventory[5] = stat.value);
        this.statMap.set(StatType.INVENTORY_6_STAT,  (stat) => this.inventory[6] = stat.value);
        this.statMap.set(StatType.INVENTORY_7_STAT,  (stat) => this.inventory[7] = stat.value);
        this.statMap.set(StatType.INVENTORY_8_STAT,  (stat) => this.inventory[8] = stat.value);
        this.statMap.set(StatType.INVENTORY_9_STAT,  (stat) => this.inventory[9] = stat.value);
        this.statMap.set(StatType.INVENTORY_10_STAT, (stat) => this.inventory[10] = stat.value);
        this.statMap.set(StatType.INVENTORY_11_STAT, (stat) => this.inventory[11] = stat.value);

        this.statMap.set(StatType.HAS_BACKPACK_STAT, (stat) => this.hasBackpack = !!stat.value);
        this.statMap.set(StatType.BACKPACK_0_STAT,   (stat) => this.backpack[0] = stat.value);
        this.statMap.set(StatType.BACKPACK_1_STAT,   (stat) => this.backpack[1] = stat.value);
        this.statMap.set(StatType.BACKPACK_2_STAT,   (stat) => this.backpack[2] = stat.value);
        this.statMap.set(StatType.BACKPACK_3_STAT,   (stat) => this.backpack[3] = stat.value);
        this.statMap.set(StatType.BACKPACK_4_STAT,   (stat) => this.backpack[4] = stat.value);
        this.statMap.set(StatType.BACKPACK_5_STAT,   (stat) => this.backpack[5] = stat.value);
        this.statMap.set(StatType.BACKPACK_6_STAT,   (stat) => this.backpack[6] = stat.value);
        this.statMap.set(StatType.BACKPACK_7_STAT,   (stat) => this.backpack[7] = stat.value);

        this.statMap.set(StatType.SIZE_STAT,    (stat) => this.size = stat.value);
        this.statMap.set(StatType.TEXTURE_STAT, (stat) => this.texture = stat.value);
        this.statMap.set(StatType.TEX1_STAT,    (stat) => this.tex1 = stat.value);
        this.statMap.set(StatType.TEX2_STAT,    (stat) => this.tex2 = stat.value);

        if (objectStatus) {
            this.parseStatus(objectStatus);
        }
    }

    public parseStatus(objectStatus: ObjectStatusData): void {
        this._parseStatus(objectStatus);
    }

    public hasEffect(effect: ConditionEffect): boolean {
        // (1<<31) will overflow 32 bit signed integer
        // so the condition is stored in an array, and the overflown bits are restarted at 0
        const overflow = 31;

        let index = 0;
        let shift = effect - 1;

        if (effect >= overflow) {
            index = 1;
            shift -= overflow;
        }

        return !!(this.condition[index] & (1 << shift));
    }
}