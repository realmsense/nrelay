import "reflect-metadata";
import { LoadedLib, LibraryInfo } from "..";

const libraries: LoadedLib<any>[] = [];

/**
 * Indicates that the decorated class is a Library which may contain packet hooks.
 * @param libInfo The library information.
 */
export function Library(libInfo: LibraryInfo): ClassDecorator {
    return (target: any) => {
        const params = Reflect.getMetadata("design:paramtypes", target) || [];
        const dependencies = params.map((type: any) => type.name);
        libraries.push({
            info: libInfo,
            target,
            dependencies,
        });
    };
}

/**
 * Returns a copy of the loaded libraries.
 */
export function getLibs(): LoadedLib<any>[] {
    return [...libraries];
}
