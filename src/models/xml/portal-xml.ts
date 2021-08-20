import { ObjectXML } from "./object-xml";

export interface PortalXML extends ObjectXML {
    class: "Portal",
    displayId: string,
    dungeonName: string,
}