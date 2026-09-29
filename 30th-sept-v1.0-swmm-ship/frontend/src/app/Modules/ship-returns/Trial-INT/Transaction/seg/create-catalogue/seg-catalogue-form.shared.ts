export const SEG_CATALOGUE_SUB_SYSTEM_OPTIONS = [
  { label: 'TX-DX Card', value: '1' },
  { label: 'Navigation Module', value: '2' },
];

export const SEG_CATALOGUE_DEPARTMENT_OPTIONS = [
  { label: 'Combat Systems', value: 'combat_systems' },
  { label: 'Navigation', value: 'navigation' },
  { label: 'Communications', value: 'communications' },
];

export const SEG_CATALOGUE_SYSTEM_OPTIONS = [
  { label: 'Radar System', value: 'radar_system' },
  { label: 'Sonar System', value: 'sonar_system' },
  { label: 'Fire Control System', value: 'fire_control_system' },
  { label: 'Navigation System', value: 'navigation_system' },
];

export const SEG_CATALOGUE_SYSTEMS_BY_DEPARTMENT: Record<
  string,
  { label: string; value: string }[]
> = {
  combat_systems: [
    { label: 'Radar System', value: 'radar_system' },
    { label: 'Fire Control System', value: 'fire_control_system' },
  ],
  navigation: [
    { label: 'Sonar System', value: 'sonar_system' },
    { label: 'Navigation System', value: 'navigation_system' },
  ],
  communications: [
    { label: 'Radar System', value: 'radar_system' },
    { label: 'Navigation System', value: 'navigation_system' },
  ],
};

export const SEG_CATALOGUE_SUBSYSTEMS_BY_SYSTEM: Record<
  string,
  { label: string; value: string }[]
> = {
  radar_system: [
    { label: 'TX-DX Card', value: '1' },
  ],
  sonar_system: [
    { label: 'Navigation Module', value: '2' },
  ],
  fire_control_system: [
    { label: 'TX-DX Card', value: '1' },
  ],
  navigation_system: [
    { label: 'Navigation Module', value: '2' },
  ],
};

export const SEG_CATALOGUE_MEDIA_TYPE_OPTIONS = [
  { label: 'EPRO M', value: '1' },
  { label: 'Flash', value: '2' },
];

export const SEG_CATALOGUE_SIZE_OPTIONS = [
  { label: '64MB', value: '64MB' },
  { label: '1MB', value: '1MB' },
  { label: '2MB', value: '2MB' },
];

export const SEG_CATALOGUE_OS_OPTIONS = [
  { label: 'Windows', value: 'Windows' },
  { label: 'Linux', value: 'Linux' },
];

export const SEG_CATALOGUE_INTERFACE_OPTIONS = [
  { label: 'Interface 1', value: '1' },
  { label: 'Interface 2', value: '2' },
];

/** Master lookup type codes for Add MMD / catalogue dropdowns */
export const SEG_MMD_MASTER_LOOKUP_CODES = {
  mmdType: 'MMDTYPE',
  mmdSize: 'MMDSIZE',
  mmdOs: 'MMDOS',
  mmdInterface: 'MMDINTERFACE',
} as const;

export const SEG_MMD_MASTER_LOOKUP_FALLBACKS = {
  mmdType: SEG_CATALOGUE_MEDIA_TYPE_OPTIONS,
  mmdSize: SEG_CATALOGUE_SIZE_OPTIONS,
  mmdOs: SEG_CATALOGUE_OS_OPTIONS,
  mmdInterface: SEG_CATALOGUE_INTERFACE_OPTIONS,
};

export type CatalogueLookupOption = { label: string; value: string };

let catalogueMmdTypeLookupOptions: CatalogueLookupOption[] = [];
let catalogueMmdSizeLookupOptions: CatalogueLookupOption[] = [];
let catalogueMmdOsLookupOptions: CatalogueLookupOption[] = [];
let catalogueMmdInterfaceLookupOptions: CatalogueLookupOption[] = [];

export function setCatalogueMmdLookupOptions(input: {
  mmdType?: CatalogueLookupOption[];
  mmdSize?: CatalogueLookupOption[];
  mmdOs?: CatalogueLookupOption[];
  mmdInterface?: CatalogueLookupOption[];
}): void {
  if (input.mmdType?.length) {
    catalogueMmdTypeLookupOptions = input.mmdType;
  }
  if (input.mmdSize?.length) {
    catalogueMmdSizeLookupOptions = input.mmdSize;
  }
  if (input.mmdOs?.length) {
    catalogueMmdOsLookupOptions = input.mmdOs;
  }
  if (input.mmdInterface?.length) {
    catalogueMmdInterfaceLookupOptions = input.mmdInterface;
  }
}

export function resolveCatalogueMmdOsLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const explicitName = pickCatalogueListValue(row, [
    'mmd_os_name',
    'os_name',
    'select_os_name',
  ]);
  if (explicitName) {
    return explicitName;
  }

  for (const key of ['select_os', 'mmd_typeos', 'os', 'mmd_os']) {
    const nestedName = resolveCatalogueNestedLookupName(row[key]);
    if (nestedName) {
      return nestedName;
    }
  }

  const raw = pickCatalogueListValue(row, [
    'select_os',
    'mmd_typeos',
    'os',
    'mmd_os',
  ]);
  if (!raw) {
    return '-';
  }

  return resolveCatalogueLookupOptionLabel(
    raw,
    catalogueMmdOsLookupOptions,
    SEG_CATALOGUE_OS_OPTIONS,
  );
}

export function resolveCatalogueMmdInterfaceLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const explicitName = pickCatalogueListValue(row, [
    'interface_name',
    'select_interface_name',
    'mmd_interface_name',
  ]);
  if (explicitName) {
    return explicitName;
  }

  for (const key of ['select_interface', 'interface', 'mmd_interface']) {
    const nestedName = resolveCatalogueNestedLookupName(row[key]);
    if (nestedName) {
      return nestedName;
    }
  }

  const raw = pickCatalogueListValue(row, [
    'select_interface',
    'interface',
    'mmd_interface',
  ]);
  if (!raw) {
    return '-';
  }

  return resolveCatalogueLookupOptionLabel(
    raw,
    catalogueMmdInterfaceLookupOptions,
    SEG_CATALOGUE_INTERFACE_OPTIONS,
  );
}

function resolveCatalogueNestedLookupName(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const name = obj['name'] ?? obj['label'];
    if (name != null && name !== '') {
      return String(name);
    }
  }

  return '';
}

function resolveCatalogueLookupOptionLabel(
  raw: string,
  dynamicOptions: CatalogueLookupOption[],
  staticOptions: CatalogueLookupOption[],
): string {
  const match = [...dynamicOptions, ...staticOptions].find(
    (option) => String(option.value) === String(raw),
  );
  return match?.label ?? raw;
}

/** SEG Verification (`approved`): 1 = Approved, 2 = Pending, 3 = Rejected */
export const SEG_VERIFICATION_OPTIONS = [
  { label: 'Approved', value: 1 },
  { label: 'Pending', value: 2 },
  { label: 'Rejected', value: 3 },
];

export const SEG_TRIALS_API = 'api/data/trials/';
export const SEG_TRIALS_DRAFT_API = 'api/drafts/trials/';
export const SEG_CATALOGUES_API = 'api/data/seg/catalogues/';

/** Default trial unit for Add MMD (SEG). */
export const SEG_ADD_MMD_TRIAL_UNIT_ID = 14;
export const SEG_ADD_MMD_TRIAL_UNIT_NAME = 'SEG';

export interface AddMmdFilterContext {
  department_id?: string;
  system_id?: string;
  subsystem_id?: string;
  sub_sub_system_id?: string;
  equipment_nomenclature?: string;
}

export interface AddMmdFormValue {
  ship_id: string;
  department_id: string;
  system_id: string;
  subsystem_id: string;
  sub_sub_system_id: string;
  mmd_type: string;
  mmd_size: string;
  mmd_os: string;
  interface: string;
  application_name: string;
  application_version: string;
  serial_no: string;
  oem_of_module: string;
  pattern_number: string;
  oem_part: string;
}

export function buildSystemHierarchyPayload(input: {
  systemId?: string | number | null;
  systemName?: string | null;
  subsystemId?: string | number | null;
  subsystemName?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  const systemId = String(input.systemId ?? '').trim();
  const subsystemId = String(input.subsystemId ?? '').trim();
  const systemName = String(input.systemName ?? '').trim() || systemId;
  const subsystemName =
    String(input.subsystemName ?? '').trim() || subsystemId;

  if (systemId && Number.isFinite(Number(systemId))) {
    payload['system_ids'] = [Number(systemId)];
    payload['system_details'] = [
      {
        system_id: Number(systemId),
        system_name: systemName,
      },
    ];
  }

  if (subsystemId && Number.isFinite(Number(subsystemId))) {
    payload['subsystem_ids'] = [Number(subsystemId)];
    payload['subsystem_details'] = [
      {
        subsystem_id: Number(subsystemId),
        subsystem_name: subsystemName,
        ...(systemId && Number.isFinite(Number(systemId))
          ? {
              system_id: Number(systemId),
              system_name: systemName,
            }
          : {}),
      },
    ];
  }

  return payload;
}

export function buildAddMmdTrialPayload(
  formValue: AddMmdFormValue,
  filters: AddMmdFilterContext = {},
  equipmentNomenclature = '',
  labels: { systemName?: string; subsystemName?: string } = {},
): Record<string, unknown> {
  const shipId = String(formValue.ship_id ?? '').trim();
  const systemId = String(formValue.system_id ?? filters.system_id ?? '').trim();
  const subsystemId = String(
    formValue.subsystem_id ?? filters.subsystem_id ?? '',
  ).trim();
  const subSubSystemId = String(
    formValue.sub_sub_system_id ?? filters.sub_sub_system_id ?? '',
  ).trim();
  const nomenclature =
    equipmentNomenclature.trim() ||
    String(filters.equipment_nomenclature ?? '').trim();

  const catalogueInfo: Record<string, unknown> = {
    ship_name: shipId,
    department_id: String(formValue.department_id ?? filters.department_id ?? ''),
    system_id: systemId,
    sub_system_name: subsystemId,
    sub_sub_system_id: subSubSystemId,
    media_type: formValue.mmd_type,
    select_size: formValue.mmd_size,
    select_os: formValue.mmd_os,
    select_interface: formValue.interface,
    application_name: formValue.application_name?.trim() ?? '',
    application_version: formValue.application_version?.trim() ?? '',
    serial_no: formValue.serial_no?.trim() ?? '',
    oem_of_module: formValue.oem_of_module?.trim() ?? '',
    pattern_number: formValue.pattern_number?.trim() ?? '',
    oem_part: formValue.oem_part?.trim() ?? '',
  };

  const mmdKnown = { ...catalogueInfo };

  const jsonData = nomenclature
    ? {
        [nomenclature]: { catalogueInfo },
        mmd_known: mmdKnown,
      }
    : { catalogueInfo, mmd_known: mmdKnown };

  const payload: Record<string, unknown> = {
    trial_type_id: CREATE_CATALOGUE_TRIAL_TYPE_ID,
    trial_unit_id: SEG_ADD_MMD_TRIAL_UNIT_ID,
    trial_unit_name: SEG_ADD_MMD_TRIAL_UNIT_NAME,
    approved: 2,
    json_data: jsonData,
  };

  if (shipId) {
    payload['ship_id'] = Number(shipId);
  }

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user?.satellite_unit_id != null && user?.satellite_unit_id !== '') {
    payload['satellite_unit_id'] = user.satellite_unit_id;
  }

  Object.assign(
    payload,
    buildSystemHierarchyPayload({
      systemId,
      systemName: labels.systemName,
      subsystemId,
      subsystemName: labels.subsystemName,
    }),
  );

  if (subSubSystemId) {
    payload['equipment_ids'] = [Number(subSubSystemId)];
  }

  return payload;
}

export function resolveSegCatalogueTrialId(
  row: Record<string, unknown> | null | undefined,
): string | null {
  if (!row) {
    return null;
  }

  const trialUuid = row['uuid'] ?? row['trial_uuid'];
  if (trialUuid == null || trialUuid === '') {
    return null;
  }

  return String(trialUuid);
}

export function formatSegVerificationLabel(approved: unknown): string {
  switch (Number(approved)) {
    case 1:
      return 'Approved';
    case 2:
      return 'Pending';
    case 3:
      return 'Rejected';
    default:
      return '-';
  }
}

export function showSegVerificationField(): boolean {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user?.satellite_unit_id != null && user?.satellite_unit_id !== '';
}

export function segVerificationBadgeClass(approved: unknown): string {
  if (approved == null || approved === '') {
    return 'ag-select-tone-neutral';
  }

  switch (Number(approved)) {
    case 1: // Approved
      return 'ag-select-tone-success';
    case 2: // Pending
      return 'ag-select-tone-warning';
    case 3: // Rejected
      return 'ag-select-tone-danger';
    default:
      return 'ag-select-tone-neutral';
  }
}

export function catalogueStatusBadgeClass(status: unknown): string {
  const label = String(status ?? '-').toLowerCase().trim();

  if (label === 'approved' || label === 'active') {
    return 'ag-select-tone-success';
  }
  if (label === 'rejected' || label === 'inactive') {
    return 'ag-select-tone-danger';
  }
  if (label === 'pending') {
    return 'ag-select-tone-warning';
  }
  if (label === 'in progress' || label === 'submitted') {
    return 'ag-select-tone-info';
  }

  return 'ag-select-tone-neutral';
}

export function renderCatalogueStatusBadge(status: unknown): string {
  const label = String(status ?? '-');
  const tone = catalogueStatusBadgeClass(label);
  return `<span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}">${label}</span>`;
}

export function resolveCatalogueApprovedValue(
  row: Record<string, unknown> | null | undefined,
): unknown {
  if (!row) {
    return null;
  }

  if (row['approved'] != null && row['approved'] !== '') {
    return row['approved'];
  }

  const fromJson = pickCatalogueListValue(row, ['approved']);
  return fromJson || null;
}

export const CATALOGUE_ACTIVE_STATUS_ACTIVE = 1;
export const CATALOGUE_ACTIVE_STATUS_INACTIVE = 2;

export const CATALOGUE_ACTIVE_STATUS_OPTIONS = [
  { label: 'Active', value: String(CATALOGUE_ACTIVE_STATUS_ACTIVE) },
  { label: 'Inactive', value: String(CATALOGUE_ACTIVE_STATUS_INACTIVE) },
] as const;

function normalizeCatalogueActiveValue(value: unknown): number | null {
  if (value == null || value === '') {
    return null;
  }

  const numeric = Number(value);
  if (numeric === CATALOGUE_ACTIVE_STATUS_ACTIVE) {
    return CATALOGUE_ACTIVE_STATUS_ACTIVE;
  }

  return CATALOGUE_ACTIVE_STATUS_INACTIVE;
}

export function resolveCatalogueActiveValue(
  row: Record<string, unknown> | null | undefined,
): number | null {
  if (!row) {
    return null;
  }

  if (row['active'] != null && row['active'] !== '') {
    return normalizeCatalogueActiveValue(row['active']);
  }

  const fromJson = pickCatalogueListValue(row, ['active']);
  if (fromJson !== '') {
    return normalizeCatalogueActiveValue(fromJson);
  }

  return null;
}

export function catalogueActiveStatusBadgeClass(active: unknown): string {
  if (active == null || active === '') {
    return catalogueStatusBadgeClass('-');
  }
  return catalogueStatusBadgeClass(
    Number(active) === CATALOGUE_ACTIVE_STATUS_ACTIVE ? 'Active' : 'Inactive',
  );
}

export function resolveCatalogueActiveStatusLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  const active = resolveCatalogueActiveValue(row);
  if (active == null) {
    return '-';
  }
  return active === CATALOGUE_ACTIVE_STATUS_ACTIVE ? 'Active' : 'Inactive';
}

export function renderCatalogueActiveStatusBadge(
  row: Record<string, unknown> | null | undefined,
): string {
  return renderCatalogueStatusBadge(resolveCatalogueActiveStatusLabel(row));
}

export function renderSegVerificationStatusBadge(approved: unknown): string {
  const label = formatSegVerificationLabel(approved);
  const tone = segVerificationBadgeClass(approved);
  return `<span class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${tone}">${label}</span>`;
}

export const CREATE_CATALOGUE_TRIAL_TYPE_ID = 6;

export const SEG_CATALOGUE_LIST_API = `api/data/trials/?trial_type_id=${CREATE_CATALOGUE_TRIAL_TYPE_ID}`;

function formatCatalogueListText(value: unknown): string {
  if (value == null || value === '') {
    return '';
  }
  return String(value);
}

/** Read catalogue list values from trial row or nested `json_data`. */
export function pickCatalogueListValue(
  row: Record<string, unknown> | null | undefined,
  keys: string[],
): string {
  if (!row) {
    return '';
  }

  for (const key of keys) {
    const value = row[key];
    if (value != null && value !== '') {
      return formatCatalogueListText(value);
    }
  }

  const json = row['json_data'];
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return '';
  }

  const seen = new Set<object>();
  const walk = (node: unknown): string => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      return '';
    }
    if (seen.has(node)) {
      return '';
    }
    seen.add(node);

    const obj = node as Record<string, unknown>;
    for (const key of keys) {
      const value = obj[key];
      if (value != null && value !== '') {
        return formatCatalogueListText(value);
      }
    }

    for (const child of Object.values(obj)) {
      const found = walk(child);
      if (found) {
        return found;
      }
    }
    return '';
  };

  return walk(json);
}

export function resolveCatalogueQuantityUnique(
  row: Record<string, unknown> | null | undefined,
): number {
  if (!row) {
    return 0;
  }

  const subsystemIds = row['subsystem_ids'];
  if (Array.isArray(subsystemIds) && subsystemIds.length) {
    return new Set(subsystemIds).size;
  }

  const systemIds = row['system_ids'];
  if (Array.isArray(systemIds) && systemIds.length) {
    return new Set(systemIds).size;
  }

  const equipmentIds = row['equipment_ids'];
  if (Array.isArray(equipmentIds) && equipmentIds.length) {
    return new Set(equipmentIds).size;
  }

  return 0;
}

export function resolveCatalogueMmdId(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const fromJson = pickCatalogueListValue(row, ['mmd_id', 'mmdId']);
  if (fromJson) {
    return fromJson;
  }

  if (row['mmd_id'] != null && row['mmd_id'] !== '') {
    return String(row['mmd_id']);
  }

  const equipmentDetails = row['equipment_details'];
  if (Array.isArray(equipmentDetails) && equipmentDetails[0]) {
    const equipment = equipmentDetails[0] as {
      mmd_id?: unknown;
      equipment_id?: unknown;
    };
    if (equipment.mmd_id != null && equipment.mmd_id !== '') {
      return String(equipment.mmd_id);
    }
    if (equipment.equipment_id != null && equipment.equipment_id !== '') {
      return String(equipment.equipment_id);
    }
  }

  return '-';
}

export function resolveCatalogueMmdSerial(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const fromJson = pickCatalogueListValue(row, [
    'serial_no',
    'mmd_serial',
    'serial_number',
  ]);
  if (fromJson) {
    return fromJson;
  }

  const equipmentDetails = row['equipment_details'];
  if (Array.isArray(equipmentDetails) && equipmentDetails[0]) {
    const serial = (equipmentDetails[0] as { serial_no?: string }).serial_no;
    if (serial) {
      return serial;
    }
  }

  return '-';
}

export function resolveCatalogueStatusLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const approved = resolveCatalogueApprovedValue(row);
  if (approved != null && approved !== '') {
    const label = formatSegVerificationLabel(approved);
    if (label !== '-') {
      return label;
    }
  }

  const fromJson = pickCatalogueListValue(row, ['seg_status', 'status']);
  if (fromJson) {
    return fromJson;
  }

  const workflow = row['workflow_rights'] as { is_working?: boolean } | undefined;
  if (workflow?.is_working === true) {
    return 'In Progress';
  }
  if (workflow?.is_working === false) {
    return 'Submitted';
  }

  return Number(row['active']) === CATALOGUE_ACTIVE_STATUS_ACTIVE
    ? 'Active'
    : 'Inactive';
}

export function resolveCatalogueMmdTypeLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const explicitName = pickCatalogueListValue(row, [
    'mmd_type_name',
    'media_type_name',
    'media_type_label',
  ]);
  if (explicitName) {
    return explicitName;
  }

  for (const key of ['media_type', 'mmd_type']) {
    const nestedName = resolveCatalogueNestedLookupName(row[key]);
    if (nestedName) {
      return nestedName;
    }
  }

  const raw = pickCatalogueListValue(row, ['media_type', 'mmd_type']);
  if (!raw) {
    return '-';
  }

  return resolveCatalogueLookupOptionLabel(
    raw,
    catalogueMmdTypeLookupOptions,
    SEG_CATALOGUE_MEDIA_TYPE_OPTIONS,
  );
}

export function resolveCatalogueMmdSizeLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const explicitName = pickCatalogueListValue(row, [
    'mmd_size_name',
    'select_size_name',
    'size_name',
  ]);
  if (explicitName) {
    return explicitName;
  }

  for (const key of ['select_size', 'mmd_size', 'size']) {
    const nestedName = resolveCatalogueNestedLookupName(row[key]);
    if (nestedName) {
      return nestedName;
    }
  }

  const raw = pickCatalogueListValue(row, ['select_size', 'mmd_size', 'size']);
  if (!raw) {
    return '-';
  }

  return resolveCatalogueLookupOptionLabel(
    raw,
    catalogueMmdSizeLookupOptions,
    SEG_CATALOGUE_SIZE_OPTIONS,
  );
}

/** Build display id: MMDType_MMDSize_MMDID (e.g. EPROM_64MB_2314). */
export function resolveCatalogueMmdIdentificationNumber(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '';
  }

  const parts = [
    resolveCatalogueMmdTypeLabel(row),
    resolveCatalogueMmdSizeLabel(row),
    resolveCatalogueMmdId(row),
  ].filter((part) => part && part !== '-');

  return parts.join('_');
}

/** Last 5 digits of catalogue trial number for MMD name suffix. */
function resolveCatalogueTrialNumberLast5(
  row: Record<string, unknown> | null | undefined,
): string {
  const trialNumber = pickCatalogueListValue(row, ['trial_number']);
  if (!trialNumber) {
    return '-';
  }

  const digits = trialNumber.replace(/\D/g, '');
  if (digits.length >= 5) {
    return digits.slice(-5);
  }
  if (digits.length > 0) {
    return digits;
  }

  const trimmed = trialNumber.trim();
  return trimmed.length >= 5 ? trimmed.slice(-5) : trimmed || '-';
}

/** Build display name: MediaType_MediaSize_TrialNumberLast5 (e.g. EPROM_64MB_12345). */
export function resolveCatalogueMmdName(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const parts = [
    resolveCatalogueMmdTypeLabel(row),
    resolveCatalogueMmdSizeLabel(row),
    resolveCatalogueTrialNumberLast5(row),
  ].filter((part) => part && part !== '-');

  return parts.length ? parts.join('_') : '-';
}

function formatCatalogueBackupHeldDate(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-') {
    return 'Not held';
  }

  return text.includes('T') ? text.split('T')[0] : text;
}

/** Last backup held date for catalogue list rows; `Not held` when absent. */
export function resolveCatalogueLastBackupHeldLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return 'Not held';
  }

  const lastBackupHeld = pickCatalogueListValue(row, ['last_backup_held']);
  if (lastBackupHeld) {
    return formatCatalogueBackupHeldDate(lastBackupHeld);
  }

  return 'Not held';
}

export function buildSegCatalogueFormConfig(
  shipOptions: { label: string; value: string }[],
  includeSegVerification = showSegVerificationField(),
): any[] {
  const fields: any[] = [
    {
      label: 'Ship Name',
      type: 'select',
      key: 'ship_name',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select--',
      options: shipOptions,
    },
    {
      label: 'System Name',
      type: 'select',
      key: 'system_name',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select--',
      options: [],
    },
    {
      label: 'Sub System Name',
      type: 'select',
      key: 'sub_system_name',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select--',
      options: SEG_CATALOGUE_SUB_SYSTEM_OPTIONS,
    },
    ...(includeSegVerification
      ? [
          {
            label: 'SEG Verification',
            type: 'select',
            key: 'approved',
            colSpan: 1.5,
            required: true,
            placeholder: '--Select--',
            options: SEG_VERIFICATION_OPTIONS,
          },
        ]
      : []),
    {
      label: 'Media Type',
      type: 'select',
      key: 'media_type',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select Media--',
      options: SEG_CATALOGUE_MEDIA_TYPE_OPTIONS,
    },
    {
      label: 'Select Size',
      type: 'select',
      key: 'select_size',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select--',
      options: SEG_CATALOGUE_SIZE_OPTIONS,
    },
    {
      label: 'Select OS',
      type: 'select',
      key: 'select_os',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select OS--',
      options: SEG_CATALOGUE_OS_OPTIONS,
    },
    {
      label: 'Select Interface',
      type: 'select',
      key: 'select_interface',
      colSpan: 1.5,
      required: true,
      placeholder: '--Select Interface--',
      options: SEG_CATALOGUE_INTERFACE_OPTIONS,
    },
    {
      label: 'Application Name',
      type: 'text',
      key: 'application_name',
      colSpan: 1.5,
      required: true,
      placeholder: 'Enter application name',
    },
    {
      label: 'Application Version',
      type: 'text',
      key: 'application_version',
      colSpan: 1.5,
      required: true,
      placeholder: 'Enter application version',
    },
    {
      label: 'Serial Number',
      type: 'text',
      key: 'serial_no',
      colSpan: 1.5,
      required: false,
      placeholder: 'Enter serial number',
    },
    {
      label: 'Make / OEM of Module',
      type: 'text',
      key: 'oem_of_module',
      colSpan: 1.5,
      required: false,
      placeholder: 'Enter OEM of module',
    },
    {
      label: 'Pattern Number of Module',
      type: 'text',
      key: 'pattern_number',
      colSpan: 1.5,
      required: false,
      placeholder: 'Enter pattern number',
    },
    {
      label: 'OEM Part no of Motherboard',
      type: 'text',
      key: 'oem_part',
      colSpan: 1.5,
      required: false,
      placeholder: 'Enter OEM part number',
    },
  ];

  return fields;
}

export function buildEmptyCatalogueFormData(): Record<string, unknown> {
  return {
    ...(showSegVerificationField() ? { approved: 2 } : {}),
    ship_name: '',
    system_name: '',
    sub_system_name: '',
    media_type: '',
    select_size: '',
    select_os: '',
    select_interface: '',
    application_name: '',
    application_version: '',
    serial_no: '',
    oem_of_module: '',
    pattern_number: '',
    oem_part: '',
  };
}

/** Map `/api/data/trials/?uuid=` row into catalogue form controls. */
export function mapTrialRowToCatalogueFormData(
  trialRow: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!trialRow) {
    return buildEmptyCatalogueFormData();
  }

  const firstSystem = Array.isArray(trialRow['system_details'])
    ? (trialRow['system_details'] as {
        system_name?: string;
        id?: string | number;
        system_id?: string | number;
      }[])[0]
    : null;
  const systemName = firstSystem?.system_name ?? '';
  const systemId =
    trialRow['system_id'] ??
    firstSystem?.system_id ??
    firstSystem?.id ??
    (Array.isArray(trialRow['system_ids']) ? trialRow['system_ids'][0] : '') ??
    '';

  const firstSubsystem = Array.isArray(trialRow['subsystem_details'])
    ? (trialRow['subsystem_details'] as {
        subsystem_id?: string | number;
        subsystem_name?: string;
        id?: string | number;
      }[])[0]
    : null;
  let subSystemValue = String(
    trialRow['sub_system_name'] ??
      firstSubsystem?.subsystem_id ??
      firstSubsystem?.id ??
      (Array.isArray(trialRow['subsystem_ids'])
        ? trialRow['subsystem_ids'][0]
        : '') ??
      '',
  );
  if (!subSystemValue && systemName) {
    const byLabel = SEG_CATALOGUE_SUB_SYSTEM_OPTIONS.find(
      (o) => o.label.toLowerCase() === systemName.toLowerCase(),
    );
    if (byLabel) {
      subSystemValue = byLabel.value;
    } else if (systemName.toLowerCase().includes('navigation')) {
      subSystemValue = '2';
    }
  }

  return {
    ship_name:
      trialRow['ship_id'] != null && trialRow['ship_id'] !== ''
        ? String(trialRow['ship_id'])
        : String(trialRow['ship_name'] ?? ''),
    system_name: systemId != null && systemId !== '' ? String(systemId) : '',
    sub_system_name: subSystemValue,
    media_type: String(trialRow['media_type'] ?? ''),
    select_size: String(trialRow['select_size'] ?? ''),
    select_os: String(trialRow['select_os'] ?? ''),
    select_interface: String(trialRow['select_interface'] ?? ''),
    application_name: String(trialRow['application_name'] ?? ''),
    application_version: String(trialRow['application_version'] ?? ''),
    serial_no: String(trialRow['serial_no'] ?? ''),
    oem_of_module: String(trialRow['oem_of_module'] ?? ''),
    pattern_number: String(trialRow['pattern_number'] ?? ''),
    oem_part: String(trialRow['oem_part'] ?? ''),
    ...(showSegVerificationField()
      ? {
          approved:
            trialRow['approved'] != null && trialRow['approved'] !== ''
              ? Number(trialRow['approved'])
              : 2,
        }
      : {}),
  };
}

/** Unwrap draft/save payloads (`catalogueInfo` or flat) into form patch data. */
export function resolveCatalogueEquipmentNomenclature(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  const details = trialRow?.['equipment_details'];
  if (!Array.isArray(details) || !details.length) {
    return '';
  }

  const first = details[0] as {
    nomenclature?: string;
    equipment_name?: string;
  };
  return String(first?.nomenclature ?? first?.equipment_name ?? '').trim();
}

function isCatalogueFieldBucket(
  value: Record<string, unknown> | null | undefined,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  return (
    value['catalogueInfo'] != null ||
    value['application_name'] != null ||
    value['application_version'] != null ||
    value['serial_no'] != null ||
    value['media_type'] != null ||
    value['select_size'] != null ||
    value['select_os'] != null ||
    value['select_interface'] != null ||
    value['system_id'] != null ||
    value['sub_system_name'] != null ||
    value['oem_part'] != null ||
    value['oem_of_module'] != null ||
    value['pattern_number'] != null
  );
}

/**
 * Match GET `/api/data/trials/` json_data shapes:
 * - `{ catalogueInfo }`
 * - `{ "Sub Sub System": { catalogueInfo }, mmd_known: {...} }`
 * - `{ mmd_known: {...} }`
 */
export function extractCatalogueJsonBucket(
  saved: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    return null;
  }

  if (saved['catalogueInfo'] && typeof saved['catalogueInfo'] === 'object') {
    return saved;
  }

  // Flat catalogue fields (already unwrapped / mmd_known content).
  if (
    isCatalogueFieldBucket(saved) &&
    saved['mmd_known'] == null &&
    !Object.keys(saved).some((key) => {
      const nested = saved[key];
      return (
        nested &&
        typeof nested === 'object' &&
        !Array.isArray(nested) &&
        (nested as Record<string, unknown>)['catalogueInfo'] != null
      );
    })
  ) {
    return saved;
  }

  const nomenclature = resolveCatalogueEquipmentNomenclature(trialRow);
  if (nomenclature) {
    const byEquipment = saved[nomenclature];
    if (
      byEquipment &&
      typeof byEquipment === 'object' &&
      !Array.isArray(byEquipment)
    ) {
      return byEquipment as Record<string, unknown>;
    }
  }

  // Prefer nested `{ catalogueInfo }` under any equipment/nomenclature key.
  for (const key of Object.keys(saved)) {
    if (key === 'mmd_known') {
      continue;
    }
    const inner = saved[key];
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) {
      continue;
    }
    const obj = inner as Record<string, unknown>;
    if (obj['catalogueInfo'] && typeof obj['catalogueInfo'] === 'object') {
      return obj;
    }
    if (isCatalogueFieldBucket(obj)) {
      return obj;
    }
  }

  // Fall back to flat `mmd_known` payload from Add MMD / save.
  const mmdKnown = saved['mmd_known'];
  if (
    mmdKnown &&
    typeof mmdKnown === 'object' &&
    !Array.isArray(mmdKnown) &&
    isCatalogueFieldBucket(mmdKnown as Record<string, unknown>)
  ) {
    return mmdKnown as Record<string, unknown>;
  }

  const keys = Object.keys(saved).filter((key) => key !== 'mmd_known');
  if (keys.length === 1) {
    const inner = saved[keys[0]];
    if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
      return inner as Record<string, unknown>;
    }
  }

  return saved;
}

export function buildCatalogueTrialJsonData(
  trialRow: Record<string, unknown> | null | undefined,
  catalogueInfo: Record<string, unknown>,
): Record<string, unknown> {
  const payload = { catalogueInfo };
  const nomenclature = resolveCatalogueEquipmentNomenclature(trialRow);
  if (!nomenclature) {
    return payload;
  }

  return { [nomenclature]: payload };
}

export function firstCatalogueTrialFromResponse(
  response: unknown,
): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const res = response as Record<string, unknown>;
  if (Array.isArray(res['results']) && res['results'].length) {
    return res['results'][0] as Record<string, unknown>;
  }
  if (Array.isArray(res['data']) && res['data'].length) {
    return res['data'][0] as Record<string, unknown>;
  }
  if (res['id'] != null || res['uuid'] != null || res['json_data'] != null) {
    return res;
  }

  return null;
}

/** Resolve saved catalogue JSON from trial row or draft response. */
export function extractCatalogueTrialJsonData(
  record: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    return null;
  }

  if (record['catalogueInfo'] && typeof record['catalogueInfo'] === 'object') {
    return record;
  }

  const jsonRaw = record['json_data'];
  if (jsonRaw && typeof jsonRaw === 'object' && !Array.isArray(jsonRaw)) {
    const bucket = extractCatalogueJsonBucket(
      jsonRaw as Record<string, unknown>,
      trialRow ?? record,
    );
    if (bucket) {
      return bucket;
    }
  }

  if (record['data'] && typeof record['data'] === 'object' && !Array.isArray(record['data'])) {
    const bucket = extractCatalogueJsonBucket(
      record['data'] as Record<string, unknown>,
      trialRow ?? record,
    );
    if (bucket) {
      return bucket;
    }
  }

  return extractCatalogueJsonBucket(record, trialRow ?? record);
}

export function buildCatalogueTrialSavePayload(
  trialUuid: string,
  trialRow: Record<string, unknown> | null | undefined,
  catalogueInfo: Record<string, unknown>,
): { id: string; json_data: Record<string, unknown> } {
  return {
    id: trialUuid,
    json_data: buildCatalogueTrialJsonData(trialRow, catalogueInfo),
  };
}

export function buildCatalogueTrialDraftPayload(
  trialUuid: string,
  trialRow: Record<string, unknown> | null | undefined,
  catalogueInfo: Record<string, unknown>,
): { trial_number: string; data: Record<string, unknown> } {
  return {
    trial_number: trialUuid,
    data: buildCatalogueTrialJsonData(trialRow, catalogueInfo),
  };
}

export function cataloguePatchFromSavedJson(
  saved: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') {
    return null;
  }

  const bucket = extractCatalogueJsonBucket(saved, trialRow);
  if (!bucket) {
    return null;
  }

  const inner =
    bucket['catalogueInfo'] && typeof bucket['catalogueInfo'] === 'object'
      ? (bucket['catalogueInfo'] as Record<string, unknown>)
      : bucket;
  const mapped = mapCatalogueRowToFormData(inner);
  const hasValue = Object.values(mapped).some(
    (v) => v !== '' && v !== null && v !== undefined,
  );
  return hasValue ? mapped : null;
}

export function mapCatalogueRowToFormData(row: any): Record<string, unknown> {
  const asSelectValue = (value: unknown): string =>
    value != null && value !== '' ? String(value) : '';

  return {
    ship_name:
      row?.ship_id != null && row?.ship_id !== ''
        ? String(row.ship_id)
        : String(row?.ship_name ?? ''),
    system_name: asSelectValue(row?.system_id ?? row?.system_name),
    sub_system_name: asSelectValue(row?.sub_system_name),
    media_type: asSelectValue(row?.media_type),
    select_size: asSelectValue(row?.select_size),
    select_os: asSelectValue(row?.select_os),
    select_interface: asSelectValue(row?.select_interface),
    application_name: row?.application_name ?? '',
    application_version: row?.application_version ?? '',
    serial_no: row?.serial_no ?? '',
    oem_of_module: row?.oem_of_module ?? '',
    pattern_number: row?.pattern_number ?? '',
    oem_part: row?.oem_part ?? '',
    ...(showSegVerificationField()
      ? {
          approved:
            row?.approved != null && row?.approved !== ''
              ? Number(row.approved)
              : '',
        }
      : {}),
  };
}

export function buildCatalogueInfoFromForm(
  formData: any,
): Record<string, unknown> {
  return {
    ship_name: formData.ship_name,
    system_name: formData.system_name,
    system_id: formData.system_name,
    sub_system_name: formData.sub_system_name,
    media_type: formData.media_type,
    select_size: formData.select_size,
    select_os: formData.select_os,
    select_interface: formData.select_interface,
    application_name: formData.application_name?.trim(),
    application_version: formData.application_version?.trim(),
    serial_no: formData.serial_no?.trim() ?? '',
    oem_of_module: formData.oem_of_module?.trim() ?? '',
    pattern_number: formData.pattern_number?.trim() ?? '',
    oem_part: formData.oem_part?.trim() ?? '',
  };
}
