import { ObjectData, ObjectStatusData, StatData, StatType } from "realmlib";
import { PlayerData } from "..";

/**
 * Processes the `data` and returns the resulting `PlayerData` object.
 * @param data The data to process.
 */
export function processObject(data: ObjectData): PlayerData {
    const playerData = processObjectStatus(data.status);
    playerData.class = data.objectType;
    return playerData;
}

/**
 * Processes the `data` and returns the result. If `currentData` is provided, it will be
 * used as a starting point for the returned `PlayerData`.
 * @param data The data to process.
 * @param currentData The existing `PlayerData`.
 */
export function processObjectStatus(data: ObjectStatusData, currentData?: PlayerData): PlayerData {
    const playerData = processStatData(data.stats, currentData);
    playerData.worldPos = data.pos;
    playerData.objectId = data.objectId;

    return playerData;
}

/**
 * Process a list of stats and returns the result. If `currentData` is provided, it will be
 * used as a starting point for the returned `PlayerData`.
 * @param stats The stats to process.
 * @param currentData The existing `PlayerData`.
 */
export function processStatData(stats: StatData[], currentData?: PlayerData): PlayerData {
    const playerData = currentData || {} as PlayerData;
    if (!playerData.inventory) {
        playerData.inventory = [];
    }
    for (const stat of stats) {
        switch (stat.type) {
            case StatType.NAME_STAT:
                playerData.name = stat.stringValue;
                continue;
            case StatType.LEVEL_STAT:
                playerData.level = stat.value;
                continue;
            case StatType.EXP_STAT:
                playerData.exp = stat.value;
                continue;
            case StatType.CURR_FAME_STAT:
                playerData.currentFame = stat.value;
                continue;
            case StatType.NUM_STARS_STAT:
                playerData.stars = stat.value;
                continue;
            case StatType.ACCOUNT_ID_STAT:
                playerData.accountId = stat.stringValue;
                continue;
            case StatType.FAME_STAT:
                playerData.accountFame = stat.value;
                continue;
            case StatType.CREDITS_STAT:
                playerData.gold = stat.value;
                continue;
            case StatType.MAX_HP_STAT:
                playerData.maxHP = stat.value;
                continue;
            case StatType.MAX_MP_STAT:
                playerData.maxMP = stat.value;
                continue;
            case StatType.HP_STAT:
                playerData.hp = stat.value;
                continue;
            case StatType.MP_STAT:
                playerData.mp = stat.value;
                continue;
            case StatType.ATTACK_STAT:
                playerData.atk = stat.value;
                continue;
            case StatType.ATTACK_BOOST_STAT:
                playerData.atkBoost = stat.value;
                continue;
            case StatType.DEFENSE_STAT:
                playerData.def = stat.value;
                continue;
            case StatType.DEFENSE_BOOST_STAT:
                playerData.defBoost = stat.value;
                continue;
            case StatType.SPEED_STAT:
                playerData.spd = stat.value;
                continue;
            case StatType.SPEED_BOOST_STAT:
                playerData.spdBoost = stat.value;
                continue;
            case StatType.DEXTERITY_STAT:
                playerData.dex = stat.value;
                continue;
            case StatType.DEXTERITY_BOOST_STAT:
                playerData.dexBoost = stat.value;
                continue;
            case StatType.VITALITY_STAT:
                playerData.vit = stat.value;
                continue;
            case StatType.VITALITY_BOOST_STAT:
                playerData.vitBoost = stat.value;
                continue;
            case StatType.CONDITION_STAT:
                playerData.condition = stat.value;
                continue;
            case StatType.WISDOM_STAT:
                playerData.wis = stat.value;
                continue;
            case StatType.WISDOM_BOOST_STAT:
                playerData.wisBoost = stat.value;
                continue;
            // case StatType.HEALTH_POTION_STACK_STAT:
            //     playerData.hpPots = stat.value;
            //     continue;
            // case StatType.MAGIC_POTION_STACK_STAT:
            //     playerData.mpPots = stat.value;
            //     continue;
            case StatType.HAS_BACKPACK_STAT:
                playerData.hasBackpack = stat.value === 1;
                continue;
            case StatType.NAME_CHOSEN_STAT:
                playerData.nameChosen = stat.value !== 0;
                continue;
            case StatType.GUILD_NAME_STAT:
                playerData.guildName = stat.stringValue;
                continue;
            case StatType.GUILD_RANK_STAT:
                playerData.guildRank = stat.value;
                continue;
            case StatType.SIZE_STAT:
                playerData.size = stat.value;
                continue;
            case StatType.NEXT_LEVEL_EXP_STAT:
                playerData.nextLevelExp = stat.value;
                continue;
            case StatType.TEX1_STAT:
                playerData.clothingDye = stat.value;
                continue;
            case StatType.TEX2_STAT:
                playerData.accessoryDye = stat.value;
                continue;
            case StatType.MAX_HP_BOOST_STAT:
                playerData.maxHPBoost = stat.value;
                continue;
            case StatType.MAX_MP_BOOST_STAT:
                playerData.maxMPBoost = stat.value;
                continue;
            case StatType.NEXT_CLASS_QUEST_FAME_STAT:
                playerData.nextClassQuestFame = stat.value;
                continue;
            case StatType.LEGENDARY_RANK_STAT:
                playerData.legendaryRank = stat.value;
                continue;
            case StatType.XP_BOOSTED_STAT:
                playerData.xpBoosted = stat.value === 1;
                continue;
            case StatType.XP_TIMER_STAT:
                playerData.xpBoostTime = stat.value;
                continue;
            case StatType.TEXTURE_STAT:
                playerData.texture = stat.value;
                continue;
            case StatType.FORTUNE_TOKEN_STAT:
                playerData.fortuneTokens = stat.value;
                continue;
            case StatType.PROJECTILE_SPEED_MULT:
                playerData.projSpeedMult = stat.value / 1000;
                continue;
            case StatType.PROJECTILE_LIFE_MULT:
                playerData.projLifeMult = stat.value / 1000;
                continue;
            case StatType.EXALTED_HP:
                playerData.exaltedHP = stat.value;
                continue;
            case StatType.EXALTED_MP:
                playerData.exaltedMP = stat.value;
                continue;
            case StatType.EXALTED_ATT:
                playerData.exaltedAtt = stat.value;
                continue;
            case StatType.EXALTED_DEF:
                playerData.exaltedDef = stat.value;
                continue;
            case StatType.EXALTED_SPEED:
                playerData.exaltedSpd = stat.value;
                continue;
            case StatType.EXALTED_DEX:
                playerData.exaltedDex = stat.value;
                continue;
            case StatType.EXALTED_VIT:
                playerData.exaltedVit = stat.value;
                continue;
            case StatType.EXALTED_WIS:
                playerData.exaltedWis = stat.value;
                continue;
            default:
                if (stat.type >= StatType.INVENTORY_0_STAT && stat.type <= StatType.INVENTORY_11_STAT) {
                    playerData.inventory[stat.type - 8] = stat.value;
                } else if (stat.type >= StatType.BACKPACK_0_STAT && stat.type <= StatType.BACKPACK_7_STAT) {
                    playerData.inventory[stat.type - 59] = stat.value;
                }
        }
    }
    return playerData;
}
