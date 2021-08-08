import { Hashable } from ".";

/**
 * A basic hash set implementation.
 */
export class HashSet<T extends Hashable> {
    private map: {
        [hash: string]: T;
    };

    constructor() {
        this.map = {};
    }

    /**
     * Adds an item to the hash set.
     * @param item The item to add.
     */
    public add(item: T): void {
        const hash = item.hash();
        this.map[hash] = item;
    }

    /**
     * Removes an item from the hash set.
     * @param item The item to remove.
     */
    public remove(item: T): void {
        const hash = item.hash();
        if (this.map[hash]) {
            delete this.map[hash];
        }
    }

    /**
     * Checks whether or not the item is contained in the hash set.
     * @param item The item to check.
     */
    public contains(item: T): boolean {
        return !!this.map[item.hash()];
    }
}
