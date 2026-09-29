import {
  patchFromSavedPayload,
  resolveTrialDateString,
  resolveTrialShipId,
  resolveTrialSubSubSystemName,
  resolveTrialSubsystemId,
  resolveTrialSystemId,
  resolveTrialSystemName,
  SegSelectOption,
} from '../seg-trial-prefill.shared';
import {
  resolveCatalogueMmdInterfaceLabel,
  resolveCatalogueMmdOsLabel,
  resolveCatalogueMmdSizeLabel,
  resolveCatalogueMmdTypeLabel,
} from '../create-catalogue/seg-catalogue-form.shared';
import {
  getStoredUser,
  getUserSatelliteUnitId,
  getUserSatelliteUnitName,
  getUserShipId,
  getUserShipName,
} from '../../../../../../shared/utils/user-satellite-unit';

/** SEG trial unit / type used for ship-request (Request Backup) trials. */
export const SEG_SHIP_REQUEST_TRIAL_UNIT_ID = 14;
export const SEG_SHIP_REQUEST_TRIAL_UNIT_NAME = 'seg';
export const SEG_SHIP_REQUEST_TRIAL_TYPE_ID = 10;

export type RequestBackupTabType = 'restoration' | 'backup';

/** API `json_data.backup_type` values for ship-request submits. */
export type ShipRequestBackupTypeApi =
  | 'restoration'
  | 'extraction'
  | 'assistance';

export const REQUEST_BACKUP_TAB_TYPES: RequestBackupTabType[] = [
  'restoration',
  'backup',
];

/** Map UI request/tab type → API `backup_type`. */
export function toShipRequestBackupTypeApi(
  uiType: string | null | undefined,
): ShipRequestBackupTypeApi {
  const raw = String(uiType ?? '').trim();
  if (raw === 'backup' || raw === 'extraction') {
    return 'extraction';
  }
  if (
    raw === 'hardware_popup' ||
    raw === 'assistance' ||
    raw === 'repair'
  ) {
    return 'assistance';
  }
  return 'restoration';
}

/** Map API / saved `backup_type` → UI radio value. */
export function fromShipRequestBackupTypeApi(
  apiType: string | null | undefined,
): RequestBackupTabType | 'hardware_popup' {
  const raw = String(apiType ?? '').trim();
  if (raw === 'extraction' || raw === 'backup') {
    return 'backup';
  }
  if (
    raw === 'assistance' ||
    raw === 'hardware_popup' ||
    raw === 'repair'
  ) {
    return 'hardware_popup';
  }
  return 'restoration';
}

/** Display label for Request Raised table `backup_type`. */
export function resolveShipRequestBackupTypeLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  const raw = resolveShipRequestBackupTypeRaw(row);
  if (!raw) {
    return '-';
  }
  const ui = fromShipRequestBackupTypeApi(raw);
  if (ui === 'backup') {
    return 'Back up';
  }
  if (ui === 'hardware_popup') {
    return 'Repair';
  }
  return 'Restoration';
}

/** Prefer top-level `backup_type`, then flat/nested `json_data.backup_type`. */
export function resolveShipRequestBackupTypeRaw(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '';
  }

  const top = String(row['backup_type'] ?? '').trim();
  if (top) {
    return top;
  }

  const jsonRaw = row['json_data'];
  let json: Record<string, unknown> | null = null;
  if (typeof jsonRaw === 'string') {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      json = null;
    }
  } else if (jsonRaw && typeof jsonRaw === 'object' && !Array.isArray(jsonRaw)) {
    json = jsonRaw as Record<string, unknown>;
  }

  if (!json) {
    return '';
  }

  const flat = String(json['backup_type'] ?? '').trim();
  if (flat) {
    return flat;
  }

  if (json['hardwarePopupInfo']) {
    return 'assistance';
  }

  for (const key of Object.keys(json)) {
    const bucket = json[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      continue;
    }
    const record = bucket as Record<string, unknown>;
    if (record['assistance'] || record['hardware_popup']) {
      return 'assistance';
    }
    if (record['extraction'] || record['backup']) {
      const nested = record['extraction'] ?? record['backup'];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedType = String(
          (nested as Record<string, unknown>)['backup_type'] ?? '',
        ).trim();
        return nestedType || 'extraction';
      }
      return 'extraction';
    }
    if (record['restoration']) {
      const nested = record['restoration'];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedType = String(
          (nested as Record<string, unknown>)['backup_type'] ?? '',
        ).trim();
        return nestedType || 'restoration';
      }
      return 'restoration';
    }
  }

  return '';
}

export const RESTORATION_PREFERENCE_COUNT = 3;
export const SEG_CATALOGUES_API = 'api/data/seg/catalogues/';

export interface RestorationPreferenceCatalogueData {
  ship_name?: string;
  system_name?: string;
  subsystem_name?: string;
  mmd_typeos: string;
  interface: string;
  size: string;
  application: string;
  name: string;
  application_version: string;
  part_no_mother_board: string;
  pattern_no_selected_mmd: string;
}

export interface RestorationPreferenceCatalogueDisplay
  extends RestorationPreferenceCatalogueData {
  preferenceLabel: string;
}

export interface RestorationPreferenceRow {
  ship: string;
  system: string;
  subsystem: string;
  mmd_type: string;
  catalogue?: RestorationPreferenceCatalogueData | null;
}

export function resolveSelectLabel(
  options: SegSelectOption[],
  value: string | number | null | undefined,
): string {
  if (value == null || value === '') return '-';
  const match = options.find((o) => String(o.value) === String(value));
  return match?.label ?? String(value);
}

export function buildPreferenceCatalogueDisplay(
  preferenceLabel: string,
  shipId: string,
  systemId: string,
  subsystemId: string,
  catalogueRow: Record<string, unknown>,
  shipOptions: SegSelectOption[],
  systemOptions: SegSelectOption[],
  subsystemOptions: SegSelectOption[],
): RestorationPreferenceCatalogueDisplay {
  const mapped = mapCatalogueApiToRequestBackupForm(catalogueRow);
  return {
    preferenceLabel,
    ship_name: resolveSelectLabel(shipOptions, shipId),
    system_name: resolveSelectLabel(systemOptions, systemId),
    subsystem_name: resolveSelectLabel(subsystemOptions, subsystemId),
    mmd_typeos: String(mapped['mmd_typeos'] ?? ''),
    interface: String(mapped['interface'] ?? ''),
    size: String(mapped['size'] ?? ''),
    application: String(mapped['application'] ?? ''),
    name: String(mapped['name'] ?? ''),
    application_version: String(mapped['application_version'] ?? ''),
    part_no_mother_board: String(mapped['part_no_mother_board'] ?? ''),
    pattern_no_selected_mmd: String(mapped['pattern_no_selected_mmd'] ?? ''),
  };
}

export function mapCatalogueApiToPreferenceCatalogueData(
  catalogueRow: Record<string, unknown>,
  shipId: string,
  systemId: string,
  subsystemId: string,
  shipOptions: SegSelectOption[],
  systemOptions: SegSelectOption[],
  subsystemOptions: SegSelectOption[],
): RestorationPreferenceCatalogueData {
  const display = buildPreferenceCatalogueDisplay(
    '',
    shipId,
    systemId,
    subsystemId,
    catalogueRow,
    shipOptions,
    systemOptions,
    subsystemOptions,
  );
  const { preferenceLabel: _label, ...data } = display;
  return data;
}

/**
 * Unique select value for a catalogue row (prefer id so same mmd_type can appear twice).
 */
export function resolveCatalogueRowOptionValue(
  row: Record<string, unknown>,
): string {
  const id = row['id'] ?? row['uuid'];
  if (id != null && String(id).trim() !== '') {
    return String(id);
  }
  return String(row['mmd_type'] ?? '');
}

/**
 * Build MMD select options from catalogue rows.
 * One option per active catalogue row (`active === 1`), not deduped by mmd_type.
 * Labels resolve lookup IDs via `setCatalogueMmdLookupOptions` / master lookups.
 */
export function mapCatalogueRowsToMmdOptions(
  rows: Record<string, unknown>[],
): SegSelectOption[] {
  const options: SegSelectOption[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (Number(row['active']) !== 1) continue;

    const mmdType = row['mmd_type'];
    if (mmdType == null || mmdType === '') continue;

    const value = resolveCatalogueRowOptionValue(row);
    if (!value || seen.has(value)) continue;
    seen.add(value);

    const typeLabel = resolveCatalogueMmdTypeLabel(row);
    const sizeLabel = resolveCatalogueMmdSizeLabel(row);
    const baseLabel =
      sizeLabel && sizeLabel !== '-'
        ? `${typeLabel} (${sizeLabel})`
        : typeLabel && typeLabel !== '-'
          ? typeLabel
          : String(mmdType);

    options.push({ label: baseLabel, value });
  }

  // Disambiguate identical labels (same type+size) with serial / trial number.
  const labelCounts = new Map<string, number>();
  for (const option of options) {
    labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1);
  }

  return options.map((option) => {
    if ((labelCounts.get(option.label) ?? 0) <= 1) {
      return option;
    }
    const row = rows.find(
      (candidate) => resolveCatalogueRowOptionValue(candidate) === option.value,
    );
    const serial = String(row?.['serial_no'] ?? '').trim();
    const trial = String(row?.['trial_number'] ?? '').trim();
    const suffix = serial || trial;
    return suffix ? { ...option, label: `${option.label} — ${suffix}` } : option;
  });
}

export function findCatalogueRowByMmdType(
  rows: Record<string, unknown>[],
  mmdType: string,
): Record<string, unknown> | undefined {
  return rows.find((row) => String(row['mmd_type'] ?? '') === String(mmdType));
}

/** Resolve dropdown selection (catalogue id/uuid or legacy mmd_type) to a row. */
export function findCatalogueRowBySelection(
  rows: Record<string, unknown>[],
  selected: string | number | null | undefined,
): Record<string, unknown> | undefined {
  if (selected == null || String(selected).trim() === '') {
    return undefined;
  }
  const key = String(selected);
  const byId = rows.find(
    (row) =>
      String(row['id'] ?? '') === key || String(row['uuid'] ?? '') === key,
  );
  if (byId) {
    return byId;
  }
  return findCatalogueRowByMmdType(rows, key);
}

export function buildEmptyRestorationPreference(): RestorationPreferenceRow {
  return { ship: '', system: '', subsystem: '', mmd_type: '', catalogue: null };
}

export function buildEmptyRestorationPreferences(): RestorationPreferenceRow[] {
  return Array.from({ length: RESTORATION_PREFERENCE_COUNT }, () =>
    buildEmptyRestorationPreference(),
  );
}

export function normalizeRestorationPreferences(
  raw: unknown,
): RestorationPreferenceRow[] {
  const empty = buildEmptyRestorationPreferences();
  if (!Array.isArray(raw)) return empty;

  return empty.map((fallback, index) => {
    const row = raw[index];
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      return fallback;
    }
    const record = row as Record<string, unknown>;
    const catalogue = record['catalogue'];
    return {
      ship: record['ship'] != null ? String(record['ship']) : '',
      system: record['system'] != null ? String(record['system']) : '',
      subsystem:
        record['subsystem'] != null ? String(record['subsystem']) : '',
      mmd_type: record['mmd_type'] != null ? String(record['mmd_type']) : '',
      catalogue:
        catalogue && typeof catalogue === 'object' && !Array.isArray(catalogue)
          ? (catalogue as RestorationPreferenceCatalogueData)
          : null,
    };
  });
}

export function extractCatalogueApiRows(response: unknown): Record<string, unknown>[] {
  if (!response) return [];
  if (Array.isArray(response)) {
    return response.filter(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    ) as Record<string, unknown>[];
  }

  const root = response as Record<string, unknown>;
  const data = root['data'];
  if (Array.isArray(data)) {
    return data.filter(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    ) as Record<string, unknown>[];
  }
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const nested = data as Record<string, unknown>;
    const results = nested['results'];
    if (Array.isArray(results)) {
      return results.filter(
        (row) => row && typeof row === 'object' && !Array.isArray(row),
      ) as Record<string, unknown>[];
    }
  }

  const results = root['results'];
  if (Array.isArray(results)) {
    return results.filter(
      (row) => row && typeof row === 'object' && !Array.isArray(row),
    ) as Record<string, unknown>[];
  }

  return [];
}

export function mapCatalogueRowsToSubsystemOptions(
  rows: Record<string, unknown>[],
): SegSelectOption[] {
  const map = new Map<string, SegSelectOption>();

  for (const row of rows) {
    const id =
      row['subsystem_id'] ??
      row['subsystem'] ??
      row['sub_system'] ??
      row['sub_system_id'];
    if (id == null || id === '') continue;

    const label = String(
      row['subsystem_name'] ??
        row['sub_system_name'] ??
        row['mmd_name'] ??
        row['mmd_id'] ??
        row['name'] ??
        id,
    );
    map.set(String(id), { label, value: String(id) });
  }

  return Array.from(map.values());
}

/** Parse nested trial / catalogue `json_data` (object or JSON string). */
export function parseShipRequestJsonData(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!row) {
    return {};
  }
  const jsonRaw = row['json_data'];
  if (!jsonRaw) {
    return {};
  }
  if (typeof jsonRaw === 'string') {
    try {
      const parsed = JSON.parse(jsonRaw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
    return {};
  }
  if (typeof jsonRaw === 'object' && !Array.isArray(jsonRaw)) {
    return jsonRaw as Record<string, unknown>;
  }
  return {};
}

/** Merge trial row with flat `json_data` fields for form/detail mapping. */
export function mergeShipRequestTrialRowWithJsonData(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!row) {
    return {};
  }
  const json = parseShipRequestJsonData(row);
  return {
    ...row,
    ...json,
    // Keep list-level display names when present.
    ship_name: row['ship_name'] ?? json['ship_name'],
    system_name: row['system_name'] ?? json['system_name'],
    subsystem_name: row['subsystem_name'] ?? json['subsystem_name'],
  };
}

/**
 * Resolve MMD type id/label for ship-request trials.
 * Prefers `mmd_type` / identification number — never treats `mmd_typeos` as type.
 */
export function resolveShipRequestMmdTypeId(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '';
  }
  const json = parseShipRequestJsonData(row);
  const direct = String(
    row['mmd_type'] ?? json['mmd_type'] ?? row['media_type'] ?? '',
  ).trim();
  if (direct && direct !== '-') {
    return direct;
  }

  const prefs = json['restoration_preferences'];
  if (Array.isArray(prefs) && prefs[0] && typeof prefs[0] === 'object') {
    const prefType = String(
      (prefs[0] as Record<string, unknown>)['mmd_type'] ?? '',
    ).trim();
    if (prefType && prefType !== '-') {
      return prefType;
    }
  }

  const identification = String(
    row['mmd_identification_number'] ??
      json['mmd_identification_number'] ??
      '',
  ).trim();
  if (!identification) {
    return '';
  }
  const firstPart = identification.split('_')[0]?.trim() ?? '';
  return firstPart && firstPart !== '-' ? firstPart : '';
}

export function resolveShipRequestMmdTypeLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }

  const json = parseShipRequestJsonData(row);
  const identification = String(
    row['mmd_identification_number'] ??
      json['mmd_identification_number'] ??
      '',
  ).trim();
  // Prefer human-readable identification prefix, e.g. "EPROM_1 MB".
  if (identification) {
    const firstPart = identification.split('_')[0]?.trim() ?? '';
    if (firstPart && firstPart !== '-' && !/^\d+$/.test(firstPart)) {
      return firstPart;
    }
  }

  const typeId = resolveShipRequestMmdTypeId(row);
  if (!typeId) {
    return '-';
  }
  if (!/^\d+$/.test(typeId)) {
    return typeId;
  }

  return resolveCatalogueMmdTypeLabel({ mmd_type: typeId });
}

export function resolveShipRequestMmdOsLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }
  return resolveCatalogueMmdOsLabel(mergeShipRequestTrialRowWithJsonData(row));
}

export function resolveShipRequestMmdSizeLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }
  return resolveCatalogueMmdSizeLabel(mergeShipRequestTrialRowWithJsonData(row));
}

export function resolveShipRequestInterfaceLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '-';
  }
  return resolveCatalogueMmdInterfaceLabel(
    mergeShipRequestTrialRowWithJsonData(row),
  );
}

/** Map catalogue / ship-request trial row into request-backup detail controls. */
export function mapCatalogueApiToRequestBackupForm(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const source = mergeShipRequestTrialRowWithJsonData(row);
  const systemId =
    source['system_id'] ?? source['system'] ?? source['system_name'] ?? '';
  const subsystemId =
    source['subsystem_id'] ??
    source['subsystem'] ??
    source['sub_system'] ??
    source['sub_system_id'] ??
    '';

  return {
    system: systemId !== '' ? String(systemId) : '',
    subsystem: subsystemId !== '' ? String(subsystemId) : '',
    mmd_typeos: String(
      source['os'] ?? source['mmd_typeos'] ?? source['select_os'] ?? '',
    ),
    interface: String(
      source['interface'] ?? source['select_interface'] ?? '',
    ),
    size: String(
      source['mmd_size'] ?? source['size'] ?? source['select_size'] ?? '',
    ),
    application: String(
      source['application'] ?? source['application_name'] ?? '',
    ),
    name: String(source['name'] ?? source['serial_no'] ?? ''),
    application_version: String(source['application_version'] ?? ''),
    part_no_mother_board: String(
      source['part_no_mother_board'] ?? source['oem_part'] ?? '',
    ),
    pattern_no_selected_mmd: String(
      source['pattern_no_selected_mmd'] ?? source['pattern_number'] ?? '',
    ),
    dart_no: String(source['dart_no'] ?? ''),
  };
}

export function buildEmptyRequestBackupFormData(
  backupType: RequestBackupTabType = 'restoration',
): Record<string, unknown> {
  return {
    backup_type: backupType,
    restoration_preferences: buildEmptyRestorationPreferences(),
    system: '',
    subsystem: '',
    mmd_typeos: '',
    interface: '',
    size: '',
    application: '',
    name: '',
    application_version: '',
    part_no_mother_board: '',
    pattern_no_selected_mmd: '',
    dart_no: '',
    ship_proposed_date: '',
    location: '',
    landing_date: '',
    reason_for_request: '',
  };
}

function resolveShipProposedDateString(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) return '';
  const raw = row['ship_proposed_date'];
  return raw != null && String(raw).trim() !== ''
    ? String(raw).slice(0, 10)
    : '';
}

export function mapTrialRowToRequestBackupFormData(
  trialRow: Record<string, unknown> | null | undefined,
  backupType: RequestBackupTabType = 'restoration',
): Record<string, unknown> {
  if (!trialRow) return buildEmptyRequestBackupFormData(backupType);
  return {
    ...buildEmptyRequestBackupFormData(backupType),
    backup_type: backupType,
    restoration_preferences: buildEmptyRestorationPreferences(),
    system: resolveTrialSystemId(trialRow),
    subsystem: resolveTrialSubsystemId(trialRow),
    landing_date: resolveTrialDateString(trialRow),
    dart_no: String(trialRow['dart_no'] ?? ''),
    ship_proposed_date: resolveShipProposedDateString(trialRow),
  };
}

export function mapRequestBackupRowToFormData(
  row: Record<string, unknown>,
  backupType?: RequestBackupTabType,
): Record<string, unknown> {
  const systemRaw = row['system'] ?? row['system_id'] ?? '';
  const subRaw = row['subsystem'] ?? row['subsystem_id'] ?? row['sub_system'] ?? '';
  const resolvedType = (row['backup_type'] ??
    backupType ??
    'restoration') as RequestBackupTabType;

  return {
    backup_type: resolvedType,
    restoration_preferences: normalizeRestorationPreferences(
      row['restoration_preferences'],
    ),
    system: systemRaw !== '' ? String(systemRaw) : '',
    subsystem: subRaw !== '' ? String(subRaw) : '',
    mmd_typeos: row['mmd_typeos'] ?? '',
    interface: row['interface'] ?? '',
    size: row['size'] ?? '',
    application: row['application'] ?? '',
    name: row['name'] ?? '',
    application_version: row['application_version'] ?? '',
    part_no_mother_board: row['part_no_mother_board'] ?? '',
    pattern_no_selected_mmd: row['pattern_no_selected_mmd'] ?? '',
    dart_no: row['dart_no'] ?? '',
    ship_proposed_date: resolveShipProposedDateString(row),
    location: row['location'] ?? row['mode'] ?? '',
    landing_date: row['landing_date'] ?? '',
    reason_for_request: row['reason_for_request'] ?? '',
  };
}

/** Form control + subsystem API must use numeric system id. */
export function resolveSystemIdForForm(
  value: unknown,
  trialRow: Record<string, unknown> | null | undefined,
  systemOptions: SegSelectOption[] = [],
): string {
  const raw = value != null && value !== '' ? String(value).trim() : '';
  if (!raw) return resolveTrialSystemId(trialRow);
  if (/^\d+$/.test(raw)) return raw;

  const fromOptions = systemOptions.find((o) => o.label === raw);
  if (fromOptions) return String(fromOptions.value);

  const details = trialRow?.['system_details'];
  if (Array.isArray(details)) {
    const match = details.find(
      (row) =>
        String((row as { system_name?: string }).system_name ?? '') === raw,
    ) as { system_id?: unknown } | undefined;
    if (match?.system_id != null && match.system_id !== '') {
      return String(match.system_id);
    }
  }

  return raw;
}

/** `json_data` outer key only — system display name (e.g. "Navigation"). */
export function resolveSystemPayloadKey(
  systemValue: unknown,
  trialRow: Record<string, unknown> | null | undefined,
  systemOptions: SegSelectOption[] = [],
): string {
  const systemId = resolveSystemIdForForm(systemValue, trialRow, systemOptions);
  if (systemId && /^\d+$/.test(systemId)) {
    const fromOptions = systemOptions.find((o) => String(o.value) === systemId);
    if (fromOptions?.label) return fromOptions.label;

    const details = trialRow?.['system_details'];
    if (Array.isArray(details)) {
      const match = details.find(
        (row) =>
          String((row as { system_id?: unknown }).system_id) === systemId,
      ) as { system_name?: string } | undefined;
      if (match?.system_name) return String(match.system_name);
    }
  }

  const raw = systemValue != null ? String(systemValue).trim() : '';
  if (raw && !/^\d+$/.test(raw)) return raw;

  const fromTrial = resolveTrialSystemName(trialRow);
  if (fromTrial) return fromTrial;

  return systemId || 'Unknown';
}

function isSystemPayloadBucket(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return REQUEST_BACKUP_TAB_TYPES.some((type) => type in (value as object));
}

/** Read saved `json_data` for one backup tab only. */
export function requestBackupPatchForTab(
  saved: Record<string, unknown> | null | undefined,
  backupType: RequestBackupTabType,
  trialRow: Record<string, unknown> | null | undefined,
  systemOptions: SegSelectOption[] = [],
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') return null;

  const legacy = saved['requestBackupInfo'];
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    const mapped = mapRequestBackupRowToFormData(
      legacy as Record<string, unknown>,
    );
    const mappedUi = fromShipRequestBackupTypeApi(
      String(mapped['backup_type'] ?? 'restoration'),
    );
    if (mappedUi !== backupType) {
      return null;
    }
    mapped['backup_type'] = backupType;
    mapped['system'] = resolveSystemIdForForm(
      mapped['system'],
      trialRow,
      systemOptions,
    );
    return mapped;
  }

  // Flat ship-request json_data: fields live at the top level.
  const flatApiType = String(saved['backup_type'] ?? '').trim();
  const flatUiType = fromShipRequestBackupTypeApi(flatApiType);
  if (
    flatApiType === backupType ||
    flatUiType === backupType ||
    (flatApiType === '' &&
      (saved['system'] != null ||
        saved['mmd_typeos'] != null ||
        saved['restoration_preferences'] != null))
  ) {
    if (
      flatApiType &&
      flatUiType !== backupType &&
      flatApiType !== backupType
    ) {
      return null;
    }
    const mapped = mapRequestBackupRowToFormData(saved, backupType);
    mapped['backup_type'] = backupType;
    mapped['system'] = resolveSystemIdForForm(
      mapped['system'],
      trialRow,
      systemOptions,
    );
    return mapped;
  }

  const preferredKey = resolveSystemPayloadKey(
    resolveTrialSystemId(trialRow),
    trialRow,
    systemOptions,
  );

  const keysToTry = [
    preferredKey,
    ...Object.keys(saved).filter(
      (key) => key !== 'requestBackupInfo' && isSystemPayloadBucket(saved[key]),
    ),
  ];

  for (const key of [...new Set(keysToTry)]) {
    const bucket = saved[key];
    if (!isSystemPayloadBucket(bucket)) continue;

    const tabRow = bucket[backupType];
    if (!tabRow || typeof tabRow !== 'object' || Array.isArray(tabRow)) {
      continue;
    }

    const mapped = mapRequestBackupRowToFormData(
      tabRow as Record<string, unknown>,
      backupType,
    );
    mapped['backup_type'] = backupType;
    mapped['system'] = resolveSystemIdForForm(
      mapped['system'],
      trialRow,
      systemOptions,
    );
    return mapped;
  }

  return null;
}

/** Build flat `json_data` for restoration/backup (no system-name nesting). */
export function buildRequestBackupJsonData(
  existingJson: Record<string, unknown> | null | undefined,
  formValue: Record<string, unknown>,
  trialRow: Record<string, unknown> | null | undefined,
  systemOptions: SegSelectOption[] = [],
): Record<string, unknown> {
  // Accept UI (`backup`) or API (`extraction`) values — ship-request submit
  // already maps to API type before calling this helper.
  const backupType = fromShipRequestBackupTypeApi(
    String(formValue['backup_type'] ?? 'restoration'),
  );
  if (backupType === 'hardware_popup') {
    return { ...(existingJson ?? {}) };
  }

  const systemId =
    backupType === 'restoration'
      ? resolveSystemIdForForm(
          (formValue['restoration_preferences'] as RestorationPreferenceRow[])?.[0]
            ?.system ?? formValue['system'],
          trialRow,
          systemOptions,
        )
      : resolveSystemIdForForm(formValue['system'], trialRow, systemOptions);

  return {
    ...formValue,
    backup_type: toShipRequestBackupTypeApi(backupType),
    system: systemId,
  };
}

export interface ShipRequestDialogSubmitInput {
  formRaw: Record<string, unknown>;
  mmdContext?: {
    shipId?: string;
    systemId?: string;
    subsystemId?: string;
    subSubSystemId?: string;
    subSubSystemLabel?: string;
    mmdType?: string;
    catalogueRow?: Record<string, unknown> | null;
  } | null;
  mmdDetails: Record<string, string>;
  lastWorkingBackup?: Record<string, string>;
  shipOptions: SegSelectOption[];
  systemOptions?: SegSelectOption[];
  subsystemOptions?: SegSelectOption[];
  subSubSystemOptions?: SegSelectOption[];
  preferenceState: Array<{
    systemOptions: SegSelectOption[];
    subsystemOptions: SegSelectOption[];
    subSubSystemOptions: SegSelectOption[];
    catalogueRows: Record<string, unknown>[];
  }>;
}

export interface ShipRequestRepairSubmitInput {
  hardwareInfo: Record<string, unknown>;
  mmdContext?: ShipRequestDialogSubmitInput['mmdContext'];
  shipOptions: SegSelectOption[];
  systemOptions?: SegSelectOption[];
  subsystemOptions?: SegSelectOption[];
  subSubSystemOptions?: SegSelectOption[];
}

function findPreferenceCatalogueRowForSubmit(
  catalogueRows: Record<string, unknown>[],
  selected: string,
  subSubSystemId?: string | null,
): Record<string, unknown> | undefined {
  if (subSubSystemId) {
    const filtered = catalogueRows.filter((row) => {
      const equipmentId =
        row['equipment_id'] ?? row['sub_sub_system_id'] ?? row['equipment'];
      return String(equipmentId ?? '') === String(subSubSystemId);
    });
    return findCatalogueRowBySelection(
      filtered.length ? filtered : catalogueRows,
      selected,
    );
  }

  return findCatalogueRowBySelection(catalogueRows, selected);
}

function resolveHierarchyLabel(
  options: SegSelectOption[] | undefined,
  id: string | undefined,
  fallback?: string,
): string {
  if (!id) {
    return String(fallback ?? '').trim();
  }
  const fromOptions = resolveSelectLabel(options ?? [], id);
  if (fromOptions && fromOptions !== '-') {
    return fromOptions;
  }
  return String(fallback ?? '').trim();
}

/** Shared outer trial fields used by restoration/backup/repair ship-request submits. */
function buildShipRequestTrialEnvelope(input: {
  jsonData: Record<string, unknown>;
  mmdContext?: ShipRequestDialogSubmitInput['mmdContext'];
  shipOptions: SegSelectOption[];
  systemOptions?: SegSelectOption[];
  subsystemOptions?: SegSelectOption[];
  subSubSystemOptions?: SegSelectOption[];
  shipIdOverride?: string;
  systemIdOverride?: string;
  subsystemIdOverride?: string;
  equipmentIdOverride?: string;
  equipmentNameOverride?: string;
  equipmentNomenclatureOverride?: string;
}): Record<string, unknown> {
  const user = getStoredUser();
  const shipIdRaw =
    input.shipIdOverride ||
    input.mmdContext?.shipId ||
    getUserShipId() ||
    user?.['ship_id'];
  const shipId =
    shipIdRaw != null && String(shipIdRaw).trim() !== ''
      ? String(shipIdRaw)
      : '';
  const shipName =
    resolveSelectLabel(input.shipOptions, shipId) !== '-'
      ? resolveSelectLabel(input.shipOptions, shipId)
      : getUserShipName() ||
        String(user?.['ship_name'] ?? user?.['unit_name'] ?? '').trim();

  const satelliteUnitId =
    getUserSatelliteUnitId() ??
    (user?.['satellite_unit_id'] != null && user?.['satellite_unit_id'] !== ''
      ? Number(user['satellite_unit_id'])
      : null);
  const satelliteUnitName =
    getUserSatelliteUnitName() ||
    String(user?.['satellite_unit_name'] ?? '').trim();

  const systemIdRaw =
    input.systemIdOverride || input.mmdContext?.systemId || undefined;
  const subsystemIdRaw =
    input.subsystemIdOverride || input.mmdContext?.subsystemId || undefined;
  const equipmentIdRaw =
    input.equipmentIdOverride ||
    input.mmdContext?.subSubSystemId ||
    undefined;

  const systemId =
    systemIdRaw != null && String(systemIdRaw).trim() !== ''
      ? String(systemIdRaw)
      : '';
  const subsystemId =
    subsystemIdRaw != null && String(subsystemIdRaw).trim() !== ''
      ? String(subsystemIdRaw)
      : '';
  const equipmentId =
    equipmentIdRaw != null && String(equipmentIdRaw).trim() !== ''
      ? String(equipmentIdRaw)
      : '';

  const systemName = resolveHierarchyLabel(input.systemOptions, systemId);
  const subsystemName = resolveHierarchyLabel(
    input.subsystemOptions,
    subsystemId,
  );
  const equipmentName = resolveHierarchyLabel(
    input.subSubSystemOptions,
    equipmentId,
    input.equipmentNameOverride || input.mmdContext?.subSubSystemLabel,
  );
  const nomenclature =
    String(input.equipmentNomenclatureOverride ?? '').trim() ||
    equipmentName;

  const payload: Record<string, unknown> = {
    json_data: input.jsonData,
    approved: 2,
    module_type: 'seg',
    trial_unit_id: SEG_SHIP_REQUEST_TRIAL_UNIT_ID,
    trial_unit_name: SEG_SHIP_REQUEST_TRIAL_UNIT_NAME,
    trial_type_id: SEG_SHIP_REQUEST_TRIAL_TYPE_ID,
  };

  if (shipId) {
    payload['ship_id'] = Number(shipId);
  }
  if (shipName) {
    payload['ship_name'] = shipName;
  }
  if (satelliteUnitId != null && Number.isFinite(satelliteUnitId)) {
    payload['satellite_unit_id'] = satelliteUnitId;
  }
  if (satelliteUnitName) {
    payload['satellite_unit_name'] = satelliteUnitName;
  }

  if (systemId && Number.isFinite(Number(systemId))) {
    payload['system_ids'] = [Number(systemId)];
    payload['system_details'] = [
      {
        system_id: Number(systemId),
        system_name: systemName || String(systemId),
      },
    ];
  }

  if (subsystemId && Number.isFinite(Number(subsystemId))) {
    payload['subsystem_ids'] = [Number(subsystemId)];
    payload['subsystem_details'] = [
      {
        subsystem_id: Number(subsystemId),
        subsystem_name: subsystemName || String(subsystemId),
        ...(systemId && Number.isFinite(Number(systemId))
          ? {
              system_id: Number(systemId),
              system_name: systemName || String(systemId),
            }
          : {}),
      },
    ];
  }

  if (equipmentId && Number.isFinite(Number(equipmentId))) {
    payload['equipment_ids'] = [Number(equipmentId)];
    payload['equipment_details'] = [
      {
        equipment_id: Number(equipmentId),
        equipment_name: equipmentName || String(equipmentId),
        nomenclature: nomenclature || equipmentName || String(equipmentId),
      },
    ];
  }

  return payload;
}

/** Build POST payload for `api/data/seg/trials/` from ship request backup dialog. */
export function buildShipRequestTrialPayload(
  input: ShipRequestDialogSubmitInput,
): Record<string, unknown> {
  const requestType = String(input.formRaw['request_type'] ?? 'restoration');
  const backupType = (
    requestType === 'backup' ? 'backup' : 'restoration'
  ) as RequestBackupTabType;

  const raw: Record<string, unknown> = {
    ...input.formRaw,
    backup_type: toShipRequestBackupTypeApi(backupType),
    system: input.mmdContext?.systemId ?? '',
    subsystem: input.mmdContext?.subsystemId ?? '',
    mmd_typeos: input.mmdDetails['mmd_typeos'] ?? '',
    interface: input.mmdDetails['interface'] ?? '',
    size: input.mmdDetails['size'] ?? '',
    application: input.mmdDetails['application'] ?? '',
    name: input.mmdDetails['name'] ?? '',
    application_version: input.mmdDetails['application_version'] ?? '',
    part_no_mother_board: input.mmdDetails['part_no_mother_board'] ?? '',
    pattern_no_selected_mmd: input.mmdDetails['pattern_no_selected_mmd'] ?? '',
    last_working_backup: input.lastWorkingBackup ?? {},
  };
  delete raw['request_type'];

  const prefRaw = input.formRaw['restoration_preferences'];
  if (Array.isArray(prefRaw)) {
    raw['restoration_preferences'] = prefRaw.map((row, index) => {
      const record =
        row && typeof row === 'object' && !Array.isArray(row)
          ? (row as Record<string, unknown>)
          : {};
      const mmdSelection = String(record['mmd_type'] ?? '');
      const state = input.preferenceState[index];
      const subSubSystemId = record['sub_sub_system'];
      const match = mmdSelection
        ? findPreferenceCatalogueRowForSubmit(
            state?.catalogueRows ?? [],
            mmdSelection,
            subSubSystemId != null && subSubSystemId !== ''
              ? String(subSubSystemId)
              : undefined,
          )
        : undefined;
      const catalogue = match
        ? mapCatalogueApiToPreferenceCatalogueData(
            match,
            String(record['ship'] ?? ''),
            String(record['system'] ?? ''),
            String(record['subsystem'] ?? ''),
            input.shipOptions,
            state?.systemOptions ?? [],
            state?.subsystemOptions ?? [],
          )
        : null;
      const mmdType = match
        ? String(match['mmd_type'] ?? mmdSelection)
        : mmdSelection;

      return {
        ship: record['ship'] != null ? String(record['ship']) : '',
        system: record['system'] != null ? String(record['system']) : '',
        subsystem:
          record['subsystem'] != null ? String(record['subsystem']) : '',
        sub_sub_system:
          record['sub_sub_system'] != null
            ? String(record['sub_sub_system'])
            : '',
        mmd_type: mmdType,
        catalogue,
      };
    });
  }

  const systemOptions =
    input.systemOptions ?? input.preferenceState[0]?.systemOptions ?? [];
  const jsonData = buildRequestBackupJsonData(null, raw, null, systemOptions);

  return buildShipRequestTrialEnvelope({
    jsonData,
    mmdContext: input.mmdContext,
    shipOptions: input.shipOptions,
    systemOptions,
    subsystemOptions:
      input.subsystemOptions ??
      input.preferenceState[0]?.subsystemOptions ??
      [],
    subSubSystemOptions:
      input.subSubSystemOptions ??
      input.preferenceState[0]?.subSubSystemOptions ??
      [],
  });
}

/**
 * Same ship-request trial envelope as restoration/backup; only `json_data`
 * carries flat repair fields.
 */
export function buildShipRequestRepairTrialPayload(
  input: ShipRequestRepairSubmitInput,
): Record<string, unknown> {
  const hardwareInfo = { ...(input.hardwareInfo ?? {}) };
  const shipId = String(
    hardwareInfo['ship_name'] ?? input.mmdContext?.shipId ?? '',
  ).trim();
  const systemId = String(
    hardwareInfo['system'] ?? input.mmdContext?.systemId ?? '',
  ).trim();
  const subsystemId = String(
    hardwareInfo['sub_system'] ?? input.mmdContext?.subsystemId ?? '',
  ).trim();
  const equipmentId = String(
    hardwareInfo['sub_sub_system'] ?? input.mmdContext?.subSubSystemId ?? '',
  ).trim();

  const jsonData: Record<string, unknown> = {
    ...hardwareInfo,
    backup_type: toShipRequestBackupTypeApi('hardware_popup'),
    system: systemId,
  };

  return buildShipRequestTrialEnvelope({
    jsonData,
    mmdContext: input.mmdContext,
    shipOptions: input.shipOptions,
    systemOptions: input.systemOptions ?? [],
    subsystemOptions: input.subsystemOptions ?? [],
    subSubSystemOptions: input.subSubSystemOptions ?? [],
    shipIdOverride: shipId || undefined,
    systemIdOverride: systemId || undefined,
    subsystemIdOverride: subsystemId || undefined,
    equipmentIdOverride: equipmentId || undefined,
  });
}

/** @deprecated Use requestBackupPatchForTab */
export function requestBackupPatchFromSavedJson(
  saved: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return patchFromSavedPayload(saved, 'requestBackupInfo', mapRequestBackupRowToFormData);
}

export const SEG_LAST_AVAILABLE_BACKUP_API =
  'api/data/seg/last-available-backup/';

export function resolveCatalogueSubSubSystemLabel(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '';
  }

  return String(
    row['equipment_name'] ??
      row['sub_sub_system_name'] ??
      row['sub_subsystem_name'] ??
      row['nomenclature'] ??
      '',
  ).trim();
}

function pickDetailIds(details: unknown, key: string): string[] {
  if (!Array.isArray(details)) {
    return [];
  }

  return details
    .map((item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? (item as Record<string, unknown>)[key]
        : null,
    )
    .filter((id) => id != null && String(id).trim() !== '')
    .map((id) => String(id));
}

function looksLikeNumericId(value: unknown): boolean {
  if (value == null || value === '') {
    return false;
  }

  return /^\d+$/.test(String(value).trim());
}

export function resolveCatalogueSubsystemId(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) {
    return '';
  }

  const directSubsystem = looksLikeNumericId(row['subsystem'])
    ? row['subsystem']
    : looksLikeNumericId(row['sub_system'])
      ? row['sub_system']
      : '';

  return pickFirstScalarId(
    row['subsystem_id'],
    row['subsystem_ids'],
    row['sub_system_id'],
    pickDetailIds(row['subsystem_details'], 'subsystem_id'),
    pickDetailIds(row['equipment_details'], 'subsystem_id'),
    directSubsystem,
    row ? resolveTrialSubsystemId(row) : '',
  );
}

export function resolveCatalogueSubSubSystemLabelFromRow(
  row: Record<string, unknown> | null | undefined,
): string {
  const direct = resolveCatalogueSubSubSystemLabel(row);
  if (direct) {
    return direct;
  }

  if (!row) {
    return '';
  }

  const fromEquipment = pickDetailIds(row['equipment_details'], 'name');
  if (fromEquipment.length) {
    return fromEquipment[0];
  }

  const fromNomenclature = pickDetailIds(row['equipment_details'], 'nomenclature');
  if (fromNomenclature.length) {
    return fromNomenclature[0];
  }

  return row ? resolveTrialSubSubSystemName(row) : '';
}

export interface LastAvailableBackupContext {
  shipId?: string | number | null;
  systemId?: string | number | null;
  subsystemId?: string | number | null;
  subSubSystemId?: string | number | null;
  subSubSystemLabel?: string | null;
  mmdType?: string | null;
  catalogueRow?: Record<string, unknown> | null;
}

function pickFirstScalarId(...values: unknown[]): string {
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item != null && String(item).trim() !== '') {
          return String(item);
        }
      }
      continue;
    }

    if (value != null && String(value).trim() !== '') {
      return String(value);
    }
  }

  return '';
}

export function resolveLastAvailableBackupParams(
  ctx: LastAvailableBackupContext | null | undefined,
): Record<string, string> | null {
  const row = ctx?.catalogueRow ?? null;

  return buildLastAvailableBackupParams({
    shipId: pickFirstScalarId(
      ctx?.shipId,
      row?.['ship_id'],
      row?.['ship_ids'],
      row ? resolveTrialShipId(row) : '',
    ),
    systemId: pickFirstScalarId(
      ctx?.systemId,
      row?.['system_id'],
      row?.['system_ids'],
      row ? resolveTrialSystemId(row) : '',
    ),
    subsystemId: pickFirstScalarId(
      ctx?.subsystemId,
      row ? resolveCatalogueSubsystemId(row) : '',
      row?.['subsystem_id'],
      row?.['subsystem_ids'],
      row?.['sub_system_id'],
      row ? resolveTrialSubsystemId(row) : '',
    ),
    subSubSystem:
      (ctx?.subSubSystemLabel != null
        ? String(ctx.subSubSystemLabel).trim()
        : '') ||
      resolveCatalogueSubSubSystemLabelFromRow(row) ||
      undefined,
    mmdType: pickFirstScalarId(
      ctx?.mmdType,
      row?.['mmd_type'],
      row?.['mmd_typeos'],
    ),
  });
}

export function buildLastAvailableBackupParams(ctx: {
  shipId?: string | number | null;
  systemId?: string | number | null;
  subsystemId?: string | number | null;
  subSubSystem?: string | null;
  mmdType?: string | null;
}): Record<string, string> | null {
  const shipId =
    ctx.shipId != null && String(ctx.shipId).trim() !== ''
      ? String(ctx.shipId)
      : '';
  const systemId =
    ctx.systemId != null && String(ctx.systemId).trim() !== ''
      ? String(ctx.systemId)
      : '';
  const subsystemId =
    ctx.subsystemId != null && String(ctx.subsystemId).trim() !== ''
      ? String(ctx.subsystemId)
      : '';

  if (!shipId || !systemId) {
    return null;
  }

  const params: Record<string, string> = {
    ship_id: shipId,
    system_id: systemId,
  };

  if (subsystemId) {
    params['subsystem_id'] = subsystemId;
  }

  const subSubSystem =
    ctx.subSubSystem != null ? String(ctx.subSubSystem).trim() : '';
  if (subSubSystem && subSubSystem !== '-') {
    params['sub_subsystem'] = subSubSystem;
  }

  const mmdType = ctx.mmdType != null ? String(ctx.mmdType).trim() : '';
  if (mmdType && mmdType !== '-') {
    params['mmd_type'] = mmdType;
  }

  return params;
}

export function extractLastAvailableBackupRow(
  response: unknown,
): Record<string, unknown> | null {
  const rows = extractLastAvailableBackupRows(response);
  return rows[0] ?? null;
}

export function extractLastAvailableBackupRows(
  response: unknown,
): Record<string, unknown>[] {
  if (!response || typeof response !== 'object') {
    return [];
  }

  const root = response as Record<string, unknown>;
  const data = root['data'];

  if (Array.isArray(data)) {
    return data.filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row),
    );
  }

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return [data as Record<string, unknown>];
  }

  if (Array.isArray(root['results'])) {
    return (root['results'] as unknown[]).filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row),
    );
  }

  // Single backup object at root (no nested data wrapper)
  if (
    root['ship_id'] != null ||
    root['mmd_type'] != null ||
    root['system_id'] != null
  ) {
    return [root];
  }

  return [];
}

/** Parse nested trial `json_data` (object or JSON string). */
function resolveLastAvailableBackupJson(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return parseShipRequestJsonData(row);
}

function resolveLastAvailableBackupExtractionInfo(
  json: Record<string, unknown>,
): Record<string, unknown> {
  const info = json['itemHandlingExtractionInfo'];
  if (info && typeof info === 'object' && !Array.isArray(info)) {
    return info as Record<string, unknown>;
  }
  return {};
}

/** MMD type id from top-level, json_data, or `mmd_identification_number` (Type_Size_...). */
function resolveLastAvailableBackupMmdTypeId(
  row: Record<string, unknown>,
  json: Record<string, unknown>,
  extraction: Record<string, unknown>,
): string {
  const direct = pickFirstScalarId(
    row['mmd_type'],
    row['media_type'],
    json['mmd_type'],
    json['media_type'],
    extraction['mmd_type'],
    extraction['media_type'],
  );
  if (direct) {
    return direct;
  }

  const identification = String(
    row['mmd_identification_number'] ??
      json['mmd_identification_number'] ??
      extraction['mmd_identification_number'] ??
      '',
  ).trim();
  if (!identification) {
    return '';
  }
  const firstPart = identification.split('_')[0]?.trim() ?? '';
  return firstPart && firstPart !== '-' ? firstPart : '';
}

function resolveLastAvailableBackupSystemName(
  row: Record<string, unknown>,
): string {
  const top = String(row['system_name'] ?? '').trim();
  if (top) {
    return top;
  }

  if (Array.isArray(row['system_details']) && row['system_details'][0]) {
    const detail = row['system_details'][0] as Record<string, unknown>;
    const name = String(
      detail['name'] ?? detail['system_name'] ?? '',
    ).trim();
    if (name) {
      return name;
    }
  }

  return '';
}

function resolveLastAvailableBackupSubsystemName(
  row: Record<string, unknown>,
  json: Record<string, unknown>,
  extraction: Record<string, unknown>,
): string {
  const top = String(
    row['subsystem_name'] ?? row['sub_system_name'] ?? '',
  ).trim();
  if (top) {
    return top;
  }

  if (Array.isArray(row['subsystem_details']) && row['subsystem_details'][0]) {
    const detail = row['subsystem_details'][0] as Record<string, unknown>;
    const name = String(
      detail['name'] ?? detail['subsystem_name'] ?? '',
    ).trim();
    if (name) {
      return name;
    }
  }

  return String(
    json['subsystem_name'] ?? extraction['subsystem_name'] ?? '',
  ).trim();
}

/** Map a last-available-backup API row into restoration preference form values. */
export function mapLastAvailableBackupToPreferenceValues(
  row: Record<string, unknown> | null | undefined,
): {
  ship: string;
  system: string;
  subsystem: string;
  sub_sub_system: string;
  mmd_type: string;
} {
  if (!row) {
    return {
      ship: '',
      system: '',
      subsystem: '',
      sub_sub_system: '',
      mmd_type: '',
    };
  }

  const json = resolveLastAvailableBackupJson(row);
  const extraction = resolveLastAvailableBackupExtractionInfo(json);
  const systemIds = Array.isArray(row['system_ids'])
    ? (row['system_ids'] as unknown[])
    : [];
  const subsystemIds = Array.isArray(row['subsystem_ids'])
    ? (row['subsystem_ids'] as unknown[])
    : [];

  return {
    ship: pickFirstScalarId(
      row['ship_id'],
      row['ship'],
      row['unit_id'],
      resolveTrialShipId(row),
    ),
    system: pickFirstScalarId(
      row['system_id'],
      systemIds[0],
      json['system'],
      extraction['system'],
      row['system'],
      resolveTrialSystemId(row),
    ),
    subsystem: pickFirstScalarId(
      resolveCatalogueSubsystemId(row),
      row['subsystem_id'],
      subsystemIds[0],
      json['subsystem'],
      extraction['subsystem'],
      row['subsystem'],
      resolveTrialSubsystemId(row),
    ),
    sub_sub_system: pickFirstScalarId(
      row['equipment_id'],
      row['sub_sub_system_id'],
      row['sub_subsystem_id'],
      json['sub_sub_system'],
      extraction['sub_sub_system'],
      row['sub_sub_system'],
      row['sub_subsystem'],
      row['equipment'],
      resolveCatalogueSubSubSystemLabel(row),
    ),
    mmd_type: resolveLastAvailableBackupMmdTypeId(row, json, extraction),
  };
}

export function mapLastAvailableBackupToDisplay(
  row: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!row) {
    return {};
  }

  const json = resolveLastAvailableBackupJson(row);
  const extraction = resolveLastAvailableBackupExtractionInfo(json);
  const mapped = mapCatalogueApiToRequestBackupForm({
    ...row,
    ...json,
    ...extraction,
    mmd_type: resolveLastAvailableBackupMmdTypeId(row, json, extraction),
    mmd_size: json['size'] ?? extraction['size'] ?? row['mmd_size'],
    size: json['size'] ?? extraction['size'] ?? row['size'],
  });

  const backupDateRaw =
    extraction['date_field'] ??
    json['ship_proposed_date'] ??
    row['date_of_backup'] ??
    row['backup_date'] ??
    row['extraction_date'] ??
    row['trial_date'] ??
    row['backup_created_date'] ??
    row['created_on'] ??
    row['created_at'] ??
    '';
  const backupDate = backupDateRaw
    ? String(backupDateRaw).split('T')[0]
    : '-';

  const mmdTypeId = resolveLastAvailableBackupMmdTypeId(row, json, extraction);
  const sizeRaw = String(
    json['size'] ??
      extraction['size'] ??
      row['mmd_size'] ??
      row['size'] ??
      '',
  ).trim();

  return {
    date_of_backup: backupDate,
    system: resolveLastAvailableBackupSystemName(row) || '-',
    subsystem:
      resolveLastAvailableBackupSubsystemName(row, json, extraction) || '-',
    sub_sub_system: String(
      resolveCatalogueSubSubSystemLabel(row) ||
        json['sub_sub_system'] ||
        extraction['sub_sub_system'] ||
        row['sub_subsystem'] ||
        '-',
    ),
    ship: String(row['ship_name'] ?? row['unit_name'] ?? '-'),
    mmd_type: mmdTypeId
      ? resolveCatalogueMmdTypeLabel({
          mmd_type: mmdTypeId,
          mmd_type_name:
            row['mmd_type_name'] ??
            json['mmd_type_name'] ??
            row['media_type_name'],
        })
      : '-',
    size: sizeRaw
      ? resolveCatalogueMmdSizeLabel({
          mmd_size: sizeRaw,
          size: sizeRaw,
        })
      : '-',
    application_version: String(
      extraction['application_version'] ??
        json['application_version'] ??
        mapped['application_version'] ??
        row['application_version'] ??
        '-',
    ),
  };
}
