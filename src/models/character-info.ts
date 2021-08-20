/**
 * The character information of an `Account`.
 */
export interface CharacterInfo {
    charId: number;
    nextCharId: number;
    maxNumChars: number;
}

export interface CharInfoCache {
    [guid: string]: CharacterInfo;
}