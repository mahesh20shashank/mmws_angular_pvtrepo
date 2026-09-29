export interface DailyOrder {
  date?: string;
  description?: string;
  officer_details?: string;
  routine_details?: string;
  pdf_path?: string;
}

export interface HierarchyNode {
  id: number | string;
  parent?: number | string | null;
  photo?: string;
  division_name?: string;
  node_type?: string;
  designation?: string;
  name?: string;
  rank?: string;
  [key: string]: unknown;
}

export interface ShipData {
  name?: string;
  ship_image?: string;
  ship_description?: string;
  [key: string]: unknown;
}

export interface GallerySlide {
    image?: string;
    [key: string]: unknown;
}

export interface CoMessage {
    message?: string;
    uploaded_date?: string;
    valid_till_date?: string;
    [key: string]: unknown;
}

export interface Birthday {
    full_name?: string;
    date_of_birth?: string;
    [key: string]: unknown;
}

export interface EventData {
    description?: string;
    date?: string;
    [key: string]: unknown;
}

export interface ShipRoleImage {
    id?: number;
    image?: string;
    [key: string]: unknown;
}

export interface ShipRole {
    id?: number;
    role_title?: string;
    current_text?: string;
    uploaded_date?: string;
    images?: ShipRoleImage[];
    [key: string]: unknown;
}

export interface LandingData {
    birthdays: Birthday[];
    coMessages: CoMessage[];
    dailyOrders: DailyOrder[];
    events: EventData[];
    gallery: GallerySlide[];
    hierarchy: HierarchyNode[];
    knowYourShip: ShipData;
    shipRoles: ShipRole[];
}
export function createEmptyLandingData(): LandingData {
    return {
        birthdays: [],
        coMessages: [],
        dailyOrders: [],
        events: [],
        gallery: [],
        hierarchy: [],
        knowYourShip: {},
        shipRoles: [],
    };
}
