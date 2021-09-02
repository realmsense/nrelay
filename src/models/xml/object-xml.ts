import { ObjectClass } from "./object-class";

export interface ObjectXML {
    type: number,
    id: string,
    className: ObjectClass,
    fullOccupy: boolean;
    occupySquare: boolean;
}