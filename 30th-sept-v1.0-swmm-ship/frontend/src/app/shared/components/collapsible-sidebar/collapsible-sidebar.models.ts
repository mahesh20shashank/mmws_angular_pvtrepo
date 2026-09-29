
export interface SidebarItem {
    id: string;
    label: string;
    icon: string;
    subHeading?: string;
    disabled?: boolean;
    badge?: string | number;
}

export interface SidebarSection {
    title?: string;
    items: SidebarItem[];
}
