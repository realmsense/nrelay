export interface IAccountInfo {
    buildVersion: string;
    accounts: IAccount[];
}
export interface IAccount {
    alias: string;
    guid: string;
    password: string;
    serverPref: string;
    charInfo: ICharacterInfo;
}

export interface ICharacterInfo {
    charId: number;
    nextCharId: number;
    maxNumChars: number;
}
