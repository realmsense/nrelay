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

        if (objectStatus) {
            this.parsePlayerStatus(objectStatus);
        }
    }

    public parsePlayerStatus(objectStatus: ObjectStatusData): void {

        this.parseEntityStatus(objectStatus);

        for (const stat of objectStatus.stats) {

            switch (stat.type) {

                // Account Data
                case StatType.NAME_CHOSEN_STAT:
                    this.nameChosen = !!stat.value;
                    break;
                case StatType.NAME_STAT:
                    this.name = stat.stringValue;
                    break;
                case StatType.ACCOUNT_ID_STAT:
                    this.accountID = stat.value;
                    break;
                case StatType.PLAYER_ID:
                    this.playerID = stat.value;
                    break;
                case StatType.SUPPORTER_STAT:
                    this.supporter = !!stat.value;
                    break;
                case StatType.SUPPORTER_POINTS_STAT:
                    this.supporterPoints = stat.value;
                    break;
                case StatType.NUM_STARS_STAT:
                    this.numStars = stat.value;
                    break;
                case StatType.FAME_STAT:
                    this.accountFame = stat.value;
                    break;
                case StatType.CREDITS_STAT:
                    this.credits = stat.value;
                    break;
                case StatType.FORTUNE_TOKEN_STAT:
                    this.fortuneToken = stat.value;
                    break;
                case StatType.CURR_FAME_STAT:
                    this.currentFame = stat.value;
                    break;
                case StatType.LEGENDARY_RANK_STAT:
                    this.legendaryRank = stat.value;
                    break;

                case StatType.UNKNOWN_119:
                    this._119 = stat.value;
                    break;
                case StatType.FORGE_FIRE:
                    this.forgeFire = stat.value;
                    break;

                // XP
                case StatType.LEVEL_STAT:
                    this.level = stat.value;
                    break;
                case StatType.EXP_STAT:
                    this.exp = stat.value;
                    break;
                case StatType.NEXT_LEVEL_EXP_STAT:
                    this.nextLevelExp = stat.value;
                    break;
                case StatType.NEXT_CLASS_QUEST_FAME_STAT:
                    this.nextClassQuestFame = stat.value;
                    break;
                case StatType.XP_BOOSTED_STAT:
                    this.xpBoosted = stat.value;
                    break;
                case StatType.XP_TIMER_STAT:
                    this.xpTimer = stat.value;
                    break;
                case StatType.LD_TIMER_STAT:
                    this.lootDropTimer = stat.value;
                    break;
                case StatType.LT_TIMER_STAT:
                    this.lootTierTimer = stat.value;
                    break;

                // Guild
                case StatType.GUILD_NAME_STAT:
                    this.guildName = stat.stringValue;
                    break;
                case StatType.GUILD_RANK_STAT:
                    this.guildRank = stat.value;
                    break;

                // Stats
                case StatType.MAX_HP_STAT:
                    this.maxHP = stat.value;
                    break;
                case StatType.HP_STAT:
                    this.hp = stat.value;
                    break;
                case StatType.MAX_MP_STAT:
                    this.maxMP = stat.value;
                    break;
                case StatType.MP_STAT:
                    this.mp = stat.value;
                    break;
                case StatType.DEXTERITY_STAT:
                    this.dexterity = stat.value;
                    break;
                case StatType.ATTACK_STAT:
                    this.attack = stat.value;
                    break;
                case StatType.DEFENSE_STAT:
                    this.defense = stat.value;
                    break;
                case StatType.VITALITY_STAT:
                    this.vitality = stat.value;
                    break;
                case StatType.WISDOM_STAT:
                    this.wisdom = stat.value;
                    break;
                case StatType.SPEED_STAT:
                    this.speed = stat.value;
                    break;

                // Stats - boost
                case StatType.MAX_MP_BOOST_STAT:
                    this.maxMP = stat.value;
                    break;
                case StatType.MAX_HP_BOOST_STAT:
                    this.maxHP = stat.value;
                    break;
                case StatType.DEXTERITY_BOOST_STAT:
                    this.boostDexterity = stat.value;
                    break;
                case StatType.ATTACK_BOOST_STAT:
                    this.boostAttack = stat.value;
                    break;
                case StatType.DEFENSE_BOOST_STAT:
                    this.boostDefense = stat.value;
                    break;
                case StatType.SPEED_BOOST_STAT:
                    this.boostSpeed = stat.value;
                    break;
                case StatType.VITALITY_BOOST_STAT:
                    this.boostVitality = stat.value;
                    break;
                case StatType.WISDOM_BOOST_STAT:
                    this.boostWisdom = stat.value;
                    break;
                case StatType.PROJECTILE_SPEED_MULT:
                    this.projectileSpeed = stat.value;
                    break;
                case StatType.PROJECTILE_LIFE_MULT:
                    this.projectileLife = stat.value;
                    break;

                // Stats - exalts
                case StatType.EXALTATION_BONUS_DAMAGE:
                    this.exaltedBonusDamage = stat.value;
                    break;
                case StatType.EXALTED_HP:
                    this.exaltedHP = stat.value;
                    break;
                case StatType.EXALTED_MP:
                    this.exaltedMP = stat.value;
                    break;
                case StatType.EXALTED_DEX:
                    this.exaltedDexterity = stat.value;
                    break;
                case StatType.EXALTED_ATT:
                    this.exaltedAttack = stat.value;
                    break;
                case StatType.EXALTED_DEF:
                    this.numStars = stat.value;
                    break;
                case StatType.EXALTED_SPEED:
                    this.exaltedSpeed = stat.value;
                    break;
                case StatType.EXALTED_VIT:
                    this.exaltedVitality = stat.value;
                    break;
                case StatType.EXALTED_WIS:
                    this.exaltedWisdom = stat.value;
                    break;

                // Inventory
                case StatType.POTION_0_TYPE:
                    this.potions[0] = stat.value;
                    break;
                case StatType.POTION_1_TYPE:
                    this.potions[1] = stat.value;
                    break;
                case StatType.POTION_2_TYPE:
                    this.potions[2] = stat.value;
                    break;

                case StatType.INVENTORY_0_STAT:
                    this.inventory[0] = stat.value;
                    break;
                case StatType.INVENTORY_1_STAT:
                    this.inventory[1] = stat.value;
                    break;
                case StatType.INVENTORY_2_STAT:
                    this.inventory[2] = stat.value;
                    break;
                case StatType.INVENTORY_3_STAT:
                    this.inventory[3] = stat.value;
                    break;
                case StatType.INVENTORY_4_STAT:
                    this.inventory[4] = stat.value;
                    break;
                case StatType.INVENTORY_5_STAT:
                    this.inventory[5] = stat.value;
                    break;
                case StatType.INVENTORY_6_STAT:
                    this.inventory[6] = stat.value;
                    break;
                case StatType.INVENTORY_7_STAT:
                    this.inventory[7] = stat.value;
                    break;
                case StatType.INVENTORY_8_STAT:
                    this.inventory[8] = stat.value;
                    break;
                case StatType.INVENTORY_9_STAT:
                    this.inventory[9] = stat.value;
                    break;
                case StatType.INVENTORY_10_STAT:
                    this.inventory[10] = stat.value;
                    break;
                case StatType.INVENTORY_11_STAT:
                    this.inventory[11] = stat.value;
                    break;

                case StatType.HAS_BACKPACK_STAT:
                    this.hasBackpack = !!stat.value;
                    break;
                case StatType.BACKPACK_0_STAT:
                    this.backpack[0] = stat.value;
                    break;
                case StatType.BACKPACK_1_STAT:
                    this.backpack[1] = stat.value;
                    break;
                case StatType.BACKPACK_2_STAT:
                    this.backpack[2] = stat.value;
                    break;
                case StatType.BACKPACK_3_STAT:
                    this.backpack[3] = stat.value;
                    break;
                case StatType.BACKPACK_4_STAT:
                    this.backpack[4] = stat.value;
                    break;
                case StatType.BACKPACK_5_STAT:
                    this.backpack[5] = stat.value;
                    break;
                case StatType.BACKPACK_6_STAT:
                    this.backpack[6] = stat.value;
                    break;
                case StatType.BACKPACK_7_STAT:
                    this.backpack[7] = stat.value;
                    break;

                case StatType.SIZE_STAT:
                    this.size = stat.value;
                    break;
                case StatType.TEXTURE_STAT:
                    this.texture = stat.value;
                    break;
                case StatType.TEX1_STAT:
                    this.tex1 = stat.value;
                    break;
                case StatType.TEX2_STAT:
                    this.tex2 = stat.value;
                    break;
            }
        }
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