
export interface DropdownOption {
    value: string;
    label: string;
}

export interface DepartmentOption {
    id: number;
    value: number;
    label: string;
    code: string;
}

export interface ConfigurationOptions {
    compartment: {
        upper_decks: DropdownOption[];
        lower_decks: DropdownOption[];
        locations: DropdownOption[];
    };


    department: DepartmentOption[];

}

export interface DropdownOptionForMapping {
    universal_id_t_equipment_ship_detail: string;
    label: string;
}

export interface EquipmentSystemDropdownResponse {
    equipment: DropdownOptionForMapping[];
    system: DropdownOptionForMapping[];
}

export interface EquipmentSystemMasterData {
    equipment: DropdownOptionForMapping[];
    system: DropdownOptionForMapping[];
}
