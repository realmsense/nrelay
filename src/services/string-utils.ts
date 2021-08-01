/**
 * Returns a string which is at least `paddingLength` characters long, which
 * contains the original `str` and spaces to fill the remaining space if there is any.
 * @param str The string to pad.
 * @param paddingLength The number of spaces to add.
 */
export function pad(str: string, paddingLength: number): string {
    if (str.length > paddingLength) {
        return str;
    }
    return (str + " ".repeat(paddingLength - str.length));
}

/**
 * Returns the current time in HH:mm:ss format.
 */
export function getTime(): string {
    const now = new Date();
    return now.toTimeString().split(" ")[0];
}
