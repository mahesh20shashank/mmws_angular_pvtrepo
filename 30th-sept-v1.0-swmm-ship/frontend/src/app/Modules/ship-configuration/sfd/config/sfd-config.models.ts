export interface GetCompartmentsParams {
    page?: number;
    page_size?: number;
    limit?: number;
    offset?: number;

    search?: string;
    main_deck?: boolean;
    upper_deck?: string;
    lower_deck?: string;
    frame_station?: string;

    location?: string;
}

export interface Compartment {
    id: number;
    name: string;
    main_deck: boolean;
    upper_deck: string | null;
    lower_deck: string | null;
    upper_deck_label?: string;
    lower_deck_label?: string;
    deck_no?: string;
    frame_station_from: number;
    frame_station_to: number;
    frame_station: string;
    location: string;
    location_value: string;
    location_label?: string;
}

export type CreateCompartmentPayload = Omit<Compartment, 'id'>;

export interface ApiResponse<T> {
    message: string;
    data: T;
}

export interface CompartmentResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: Compartment[];
}

export interface GetSubDepartmentsParams {
    page?: number;
    page_size?: number;
    search?: string;
    department?: number;
    equipment_count?: number;
}

export interface SubDepartment {
    id: number;
    department_name: string;
    department: string;
    name: string;
    equipment_count: number;
    /** "CMMS" if this row carries a real CMMS uid (synced or adopted-by-name during
     *  Step 1), "SWMM" if it was created here by hand and CMMS hasn't named it yet. */
    source: "CMMS" | "SWMM";
    active: boolean;
}

export interface SubDepartmentSummaryRow {
    department: string;
    total: number;
    cmms: number;
    swmm: number;
    in_use: number;
}

export interface SubDepartmentSummary {
    status: boolean;
    total: number;
    by_department: SubDepartmentSummaryRow[];
    can_see_all_departments: boolean;
    own_department_id: number | null;
}

export interface CreateSubdepartmentPayload {
    name: string;
    department: string;
}

export interface SubDepartmentResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: SubDepartment[];
}

export interface Mapping {
    equipmentId: string;
    systemId: string;

    equip: string;
    system: string;

    mapping_date: string;
    status: string;
}

/** Flattened row fed to the Mapped Sys/Eqpt data-grid — a system header row followed
 *  by its equipment rows while the group is expanded. */
export interface MappedGridRow extends Mapping {
    groupKey: string;
    isChild: boolean;
    multi: boolean;
    equipCount: number;
    expanded: boolean;
}

export interface LocationMapping {
    id: number;
    equipment: string;
    equipmentId: number;
    compartment_name: string;
    compt_id?: number;
    deck_no: string | null;
    main_deck: boolean;
    upper_deck: string | null;
    lower_deck: string | null;
    frame_station_from: string;
    frame_station_to: string;
    frame_station: string | null;
    location: string | null;
    mapping_status: 'mapped' | 'unmapped';
}

export type ConfigSection = 'compartment' | 'subdept' | 'mapping' | 'referenceData' | 'sfd' | 'locationMapping' | 'rhsiMaster';
export type ModalType = 'compartment' | 'subDepartment' | 'mapping' | 'delete' | 'mapEquipment' | 'sfd' | 'locationMapping' | null;
export interface CreateLocationMappingPayload {
    equipment: number;
    compartment: number;
}
export interface CompartmentDeletePayload {
    type: 'compartment';
    data: Compartment;
}

export interface SubDepartmentDeletePayload {
    type: 'subDepartment';
    data: SubDepartment;
}

export interface MappingDeletePayload {
    type: 'mapping';
    data: Mapping;
}

export interface LocationMappingDeletePayload {
    type: "loactionMapping";
    data: LocationMapping
}



// Discriminated union — TS narrows `data` automatically based on `type`
export type DeletePayload =
    | CompartmentDeletePayload
    | SubDepartmentDeletePayload
    | MappingDeletePayload
    | LocationMappingDeletePayload

export interface ModalState {
    type: ModalType;
    data: DeletePayload | Compartment | SubDepartment | Mapping | LocationMapping | SfdEquipment |  null;
}


export interface PaginationParams {
    page?: number;
    page_size?: number;
    search?: string;
}

export interface GetMasterListParams extends PaginationParams {
    search?: string;
}


export interface DropdownOptionForMapping {
    universal_id_t_equipment_ship_detail: string;
    label: string;
}

export interface EquipmentSystemDropdownResponse {
    equipment: DropdownOptionForMapping[];
    system: DropdownOptionForMapping[];
}

export interface CreateEquipmentSystemMappingPayload {
    equipment: string | string[];
    system: string | null;
}


export interface EquipmentSystemMappingResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: EquipmentSystemMapping[];
}

export interface EquipmentSystemMapping {
    equipment: DropdownOptionForMapping;
    system: DropdownOptionForMapping | null;
    addition_date: string;
    mapping_status: string;
}

/** PATCH `equipment-system-mappings/{id}/` body — `id` is the equipment's own
 * `universal_id_t_equipment_ship_detail`, `system` is the new system's. Matches
 * `EquipmentSystemMappingUpdateSerializer` (sfd/source_contract.py), which requires at least one
 * of the two fields. */
export interface UpdateEquipmentSystemMappingPayload {
    system?: string;
    mapping_status?: string;
}


export interface GetEquipmentSystemMappingsParams extends PaginationParams {
    equipment?: string;
    system?: string;
    mapping_status?: string;
    addition_date_from?: string;
    addition_date_to?: string;
}


export interface MappedEquipmentRaw {
    id: number;
    equipment_ship_id: string;
    equipment: number | null;
    system: number | null;
    equipment_name: string | null;
    new_equipment_name: string | null;
    new_system_name: string | null;
    equipment_master_name: string | null;
    mapping_status: string | null;
    mapped_to: string | null;
    mapped_at: string | null;
}

export interface GetMappedEquipmentListParams extends PaginationParams {
    equipment_id?: string;
    system_id?: string;
    mapping_date_from?: string;
    mapping_date_to?: string;
}


export interface SfdEquipment {
    id: number;
    universal_id: string;
    equipment_code: string;
    equipment_name: string;
    serial_no: string;
    oem: string;
    supplier: string;
    installation_date: string;
    installation_authority: string;
    deck_no: string | null;
    frame_station: string;
    compartment: string;
    location: string;
    qty_fitted: number;
    sub_department: string;
    department: string;
    maintop_no: number;
    status: string;
}
export interface SfdEquipmentResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: SfdEquipment[];
}

export interface GetSfdEquipmentParams extends PaginationParams {
    search?: string;
    equipment_name?: string;
    equipment_code?: string;
    maintop_no?: string;
    status?: string;
    system?: string;
    sub_department?: string;
    location?: string;
}

export interface EquipmentCompartmentDropdownOption {
    id: number;
    label: string;
}

export interface CompartmentDropdownOption {
    id: number;
    label: string;
    main_deck: boolean;
    upper_deck: string | null;
    lower_deck: string | null;
    frame_station_from: number;
    frame_station_to: number;
    location: string;
}

export interface EquipmentCompartmentDropdownResponse {
    equipment: EquipmentCompartmentDropdownOption[];
    compartment: CompartmentDropdownOption[];
}



export interface EquipmentCompartmentMapping {
    id: number;
    equipment: number;
    equipment_name: string;
    compartment: number;
    compartment_name: string;
    deck_no: string | null;
    frame_station: string | null;
    location: string | null;
    mapping_status: 'mapped' | 'unmapped';
    created_at: string;
}

export interface EquipmentCompartmentMappingResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: EquipmentCompartmentMapping[];
}

export interface GetEquipmentCompartmentMappingsParams
    extends PaginationParams {

    equipment?: string;
    compartment?: string;

    main_deck?: boolean;
    upper_deck?: string;
    lower_deck?: string;

    frame_station?: string;
    location?: string;

    mapping_status?: 'mapped' | 'unmapped';
}


export interface EquipmentDropdown {
    equipment_id: number;
    equipment_code: string | null;
    equipment_name: string;
    equipment_model?: string | null;
    maintop_number?: string | null;
    manufacturer_name?: string | null;
    authority?: string | null;
    ilms_equipment_code?: string | null;
    universal_id_m_equipment?: string | null;
}

export interface EquipmentDropdownResponse {
    count: number;
    next: string | null;
    previous: string | null;
    results: EquipmentDropdown[];
}
export type SystemListItem = EquipmentDropdown;
export type SystemListResponse = EquipmentDropdownResponse;

export interface ConvertSystemToEquipmentPayload {
    system_ids: number[];
}

export interface ConvertSystemToEquipmentResponse {
    status: string;
    message: string;
    converted_count: number;
}

export interface ConvertEquipmentToSystemPayload {
    equipment_ids: number[];
}

export interface ConvertEquipmentToSystemResponse {
    status: string;
    message: string;
    converted_count: number;
}

export interface CreateEquipmentMappingPayload {
    system_id: number;
    equipment_ids: number[];
}
