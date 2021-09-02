import { ObjectXML } from "./object-xml";

export interface PortalXML extends ObjectXML {
    className: "Portal",
    displayId: string,
    dungeonName: string,
}