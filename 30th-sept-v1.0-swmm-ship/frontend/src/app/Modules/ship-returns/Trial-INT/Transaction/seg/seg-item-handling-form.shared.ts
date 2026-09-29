import {
  hasPatchValues,
  mapTrialRowToCatalogueDetailFields,
  patchFromSavedPayload,
  resolveTrialDateString,
  resolveTrialShipId,
  resolveTrialSubsystemId,
  resolveTrialSubSubSystemId,
  resolveTrialSystemId,
  SegSelectOption,
} from './seg-trial-prefill.shared';
import {
  fromShipRequestBackupTypeApi,
  mapCatalogueApiToRequestBackupForm,
  requestBackupPatchForTab,
  resolveShipRequestBackupTypeRaw,
  resolveShipRequestInterfaceLabel,
  resolveShipRequestMmdOsLabel,
  resolveShipRequestMmdSizeLabel,
  resolveSystemIdForForm,
  resolveSystemPayloadKey,
  type RequestBackupTabType,
} from './request-backup-popup/seg-request-backup-form.shared';
import { resolveCatalogueMmdTypeLabel } from './create-catalogue/seg-catalogue-form.shared';

export const SEG_CATALOGUES_API = 'api/data/seg/catalogues/';

export const COMPATIBLE_BACKUP_API = 'master/compatible-backup/';

export interface CompatibleBackupApiRow {
  id: number;
  ship_name?: string;
  system_name?: string;
  image_url?: string;
  image_name?: string;
  mmd_type?: string;
  extraction_format?: string;
  date?: string;
  ship?: number;
  system?: number;
  sub_system?: number;
}

export interface CatalogueBackupItem {
  id?: number;
  extraction_date: string;
  file_name: string;
  extraction_format: string;
  image_url?: string;
  sub_system?: string;
  mmd_type?: string;
  mmd_size?: string;
  mmd_id?: string;
  status?: string;
  mmd_serial?: string;
  seg_verifica?: string;
}

export function mapCompatibleBackupToCatalogueItem(
  row: CompatibleBackupApiRow,
): CatalogueBackupItem {
  const dateRaw = row.date ?? '';
  return {
    id: row.id,
    extraction_date: dateRaw ? String(dateRaw).split('T')[0] : '',
    file_name: row.image_name ?? '',
    extraction_format: resolveItemHandlingExtractionFormatLabel(
      row.extraction_format ?? row.mmd_type,
    ),
    image_url: row.image_url,
    mmd_type: row.mmd_type,
    sub_system: row.sub_system != null ? String(row.sub_system) : undefined,
  };
}

export function resolveCompatibleBackupMmdType(
  raw: unknown,
  options: SegSelectOption[],
): string | null {
  if (raw == null || raw === '') return null;
  const str = String(raw).trim();
  const match = options.find(
    (o) => String(o.value) === str || o.label === str,
  );
  return match?.label ?? str;
}

export interface CompatibleBackupQueryParams {
  ship_id?: string | number;
  system_id: string | number;
  subsystem_id?: string | number;
  sub_subsystem?: string | number;
  mmd_type?: string;
}

export interface AvailableBackupItem {
  id?: number;
  system?: string;
  sub_system?: string;
  file_name: string;
  extraction_format: string;
  image_url?: string;
  selected?: boolean;
}

export interface ShipSuggestedBackupItem {
  id?: number;
  ship_name: string;
  file_name: string;
  extraction_format: string;
  image_url?: string;
  selected?: boolean;
}

export function mapCompatibleBackupToAvailableBackupItem(
  row: CompatibleBackupApiRow,
  selected = false,
): AvailableBackupItem {
  return {
    id: row.id,
    system: row.system_name ?? '',
    sub_system: row.sub_system != null ? String(row.sub_system) : '',
    file_name: row.image_name ?? '',
    extraction_format: resolveItemHandlingExtractionFormatLabel(
      row.extraction_format ?? row.mmd_type,
    ),
    image_url: row.image_url,
    selected,
  };
}

export function mapCompatibleBackupToShipSuggestedItem(
  row: CompatibleBackupApiRow,
  selected = false,
): ShipSuggestedBackupItem {
  return {
    id: row.id,
    ship_name: row.ship_name ?? '',
    file_name: row.image_name ?? '',
    extraction_format: resolveItemHandlingExtractionFormatLabel(
      row.extraction_format ?? row.mmd_type,
    ),
    image_url: row.image_url,
    selected,
  };
}

/** Resolve compatible-backup filters from form values with trial/context fallbacks. */
export function buildCompatibleBackupQueryParams(
  ctx: {
    formValues: Record<string, unknown>;
    trialRow: Record<string, unknown> | null | undefined;
    mmdTypeOptions: SegSelectOption[];
  },
  options?: { requireShipId?: boolean; includeMmdType?: boolean },
): CompatibleBackupQueryParams | null {
  const requireShipId = options?.requireShipId ?? true;
  const includeMmdType = options?.includeMmdType ?? true;
  const trial = ctx.trialRow;
  const shipId =
    resolveTrialShipId(trial) ||
    String(trial?.['ship'] ?? '').trim() ||
    String(ctx.formValues['ship_id'] ?? ctx.formValues['ship'] ?? '').trim();

  const system =
    String(ctx.formValues['system'] ?? '').trim() ||
    resolveTrialSystemId(trial);

  const subSystem =
    String(ctx.formValues['subsystem'] ?? ctx.formValues['sub_system'] ?? '').trim() ||
    resolveTrialSubsystemId(trial);

  const subSubSystem =
    String(
      ctx.formValues['sub_sub_system'] ??
        ctx.formValues['sub_subsystem'] ??
        '',
    ).trim() || resolveTrialSubSubSystemId(trial);

  const mmdType =
    resolveCompatibleBackupMmdType(ctx.formValues['mmd_typeos'], ctx.mmdTypeOptions) ||
    resolveCompatibleBackupMmdType(trial?.['mmd_type'], ctx.mmdTypeOptions) ||
    resolveCompatibleBackupMmdType(trial?.['mmd_typeos'], ctx.mmdTypeOptions) ||
    (trial?.['mmd_type_name']
      ? String(trial['mmd_type_name']).trim()
      : null);

  if (!system) {
    return null;
  }
  if (requireShipId && !shipId) {
    return null;
  }

  const params: CompatibleBackupQueryParams = { system_id: system };
  if (shipId) {
    params.ship_id = shipId;
  }
  if (subSystem) {
    params.subsystem_id = subSystem;
  }
  if (subSubSystem) {
    params.sub_subsystem = subSubSystem;
  }
  if (mmdType && includeMmdType) {
    params.mmd_type = mmdType;
  }
  return params;
}

export function extractCompatibleBackupApiRows(
  response: unknown,
): CompatibleBackupApiRow[] {
  if (!response) return [];
  if (Array.isArray(response)) {
    return response as CompatibleBackupApiRow[];
  }

  const root = response as Record<string, unknown>;
  for (const key of ['data', 'results']) {
    const bucket = root[key];
    if (Array.isArray(bucket)) {
      return bucket as CompatibleBackupApiRow[];
    }
  }

  return [];
}

export interface SegItemHandlingExtractionFieldLabels {
  system: string;
  subsystem: string;
  mmd_typeos: string;
  interface: string;
  size: string;
  application: string;
  name: string;
  application_version: string;
  part_no_mother_board: string;
  pattern_no_selected_mmd: string;
  app_req_status: string;
  date_field: string;
  backup_location: string;
  backup_file_format: string;
  backup_file_name: string;
}

export const SEG_ITEM_HANDLING_EXTRACTION_FIELD_LABELS: SegItemHandlingExtractionFieldLabels =
  {
    system: 'System',
    subsystem: 'Subsystem',
    mmd_typeos: 'MMD TypeOS',
    interface: 'Interface',
    size: 'Size',
    application: 'Application',
    name: 'Name',
    application_version: 'Application Version',
    part_no_mother_board: 'Part No of Mother Board',
    pattern_no_selected_mmd: 'Pattern No of Selected MMD',
    app_req_status: 'App Req Status',
    date_field: 'Date',
    backup_location: 'Backup Location',
    backup_file_format: 'Backup File Format',
    backup_file_name: 'Backup File Name',
  };

export type SegItemHandlingRestorationFieldLabels = SegItemHandlingExtractionFieldLabels;

export const SEG_ITEM_HANDLING_RESTORATION_FIELD_LABELS: SegItemHandlingRestorationFieldLabels =
  SEG_ITEM_HANDLING_EXTRACTION_FIELD_LABELS;

export const SEG_APPROVED_TRIALS_API = 'api/data/seg/trials/?seg_status=Approved';

export interface ItemHandlingMmdDetailItem {
  label: string;
  value: string;
  displayValue: string;
}

/** Compact readable text for MMD detail tiles (handles long URLs). */
export function formatItemHandlingDisplayValue(
  value: string | null | undefined,
  maxLength = 36,
): string {
  const text = String(value ?? '').trim();
  if (!text || text === '-') {
    return '-';
  }
  if (text.length <= maxLength) {
    return text;
  }
  if (/^https?:\/\//i.test(text)) {
    try {
      const url = new URL(text);
      const segment =
        url.pathname.split('/').filter(Boolean).pop() || url.hostname;
      const compact = decodeURIComponent(segment);
      return compact.length <= maxLength
        ? compact
        : `${compact.slice(0, maxLength - 1)}…`;
    } catch {
      return `${text.slice(0, maxLength - 1)}…`;
    }
  }
  return `${text.slice(0, maxLength - 1)}…`;
}

function buildMmdDetailItem(
  label: string,
  value: string | null | undefined,
): ItemHandlingMmdDetailItem {
  const normalized = String(value ?? '').trim() || '-';
  return {
    label,
    value: normalized,
    displayValue: formatItemHandlingDisplayValue(normalized),
  };
}

export function parseTrialJsonData(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!row) {
    return null;
  }

  const raw = row['json_data'];
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null') {
      return null;
    }
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return null;
}

/** Merge catalogue / draft fields from `json_data` onto the approved-request row. */
export function resolveItemHandlingTrialRow(
  row: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!row) {
    return null;
  }

  const normalized: Record<string, unknown> = { ...row };
  const catalogueFromApi = mapCatalogueApiToRequestBackupForm(row);
  const jsonSaved = parseTrialJsonData(row);

  if (jsonSaved) {
    const extractionDraft = itemHandlingExtractionPatchFromSaved(jsonSaved);
    const restorationDraft = itemHandlingRestorationPatchFromSaved(
      jsonSaved,
      row,
    );
    const draftPatch = extractionDraft ?? restorationDraft;

    if (draftPatch) {
      for (const [key, value] of Object.entries(draftPatch)) {
        if (value != null && value !== '') {
          normalized[key] = value;
        }
      }
    } else {
      const apiType = resolveShipRequestBackupTypeRaw(row);
      const uiType = fromShipRequestBackupTypeApi(apiType);
      const tabType: RequestBackupTabType =
        uiType === 'backup' ? 'backup' : 'restoration';
      const backupPatch = requestBackupPatchForTab(jsonSaved, tabType, row);
      if (backupPatch) {
        for (const [key, value] of Object.entries(backupPatch)) {
          if (value != null && value !== '') {
            normalized[key] = value;
          }
        }
      }
    }
  }

  for (const [key, value] of Object.entries(catalogueFromApi)) {
    if (
      value != null &&
      value !== '' &&
      (normalized[key] == null || normalized[key] === '')
    ) {
      normalized[key] = value;
    }
  }

  return normalized;
}

export function buildApprovedRequestOptionLabel(
  row: Record<string, unknown>,
): string {
  const requestId = String(
    row['request_id'] ?? row['trial_number'] ?? row['uuid'] ?? 'Request',
  );
  const system = String(row['system_name'] ?? '');
  const subsystem = String(
    row['subsystem_name'] ??
      (Array.isArray(row['subsystem_details'])
        ? (row['subsystem_details'][0] as { subsystem_name?: string })
            ?.subsystem_name
        : '') ??
      '',
  );
  const parts = [requestId, system, subsystem].filter(Boolean);
  return parts.join(' — ');
}

export function buildItemHandlingMmdDetailItems(
  trialRow: Record<string, unknown> | null | undefined,
): ItemHandlingMmdDetailItem[] {
  const resolvedRow = resolveItemHandlingTrialRow(trialRow);
  if (!resolvedRow) {
    return [];
  }

  const catalogue = mapTrialRowToCatalogueDetailFields(resolvedRow);

  return [
    buildMmdDetailItem('System', catalogue['system']),
    buildMmdDetailItem('Sub System', catalogue['subsystem']),
    buildMmdDetailItem('Sub Sub System', catalogue['sub_sub_system']),
    buildMmdDetailItem('MMD OS', resolveShipRequestMmdOsLabel(resolvedRow)),
    buildMmdDetailItem(
      'Interface',
      resolveShipRequestInterfaceLabel(resolvedRow),
    ),
    buildMmdDetailItem('Size', resolveShipRequestMmdSizeLabel(resolvedRow)),
    buildMmdDetailItem('Application Name', catalogue['application']),
    buildMmdDetailItem('Application Version', catalogue['application_version']),
    buildMmdDetailItem(
      'Part No of Motherboard',
      catalogue['part_no_mother_board'],
    ),
    buildMmdDetailItem(
      'Pattern No of Selected MMD',
      catalogue['pattern_no_selected_mmd'],
    ),
  ];
}

/** Resolve MMD type / format IDs to lookup labels for backup tables. */
export function resolveItemHandlingExtractionFormatLabel(
  raw: unknown,
): string {
  const value = String(raw ?? '').trim();
  if (!value || value === '-') {
    return '-';
  }
  if (!/^\d+$/.test(value)) {
    return value;
  }
  return resolveCatalogueMmdTypeLabel({ mmd_type: value, media_type: value });
}

/** Ensure a prefilled value appears in a disabled select’s option list. */
export function ensureSelectOption(
  options: SegSelectOption[],
  value: string | number | null | undefined,
  label?: string,
): SegSelectOption[] {
  const v = value != null && value !== '' ? String(value) : '';
  if (!v) return options;
  if (options.some((o) => String(o.value) === v)) return options;
  return [...options, { label: (label ?? v).trim() || v, value: v }];
}

export function mapTrialRowToItemHandlingFormData(
  trialRow: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const resolvedRow = resolveItemHandlingTrialRow(trialRow);
  const catalogue = mapTrialRowToCatalogueDetailFields(resolvedRow);
  const dateStr = resolveTrialDateString(resolvedRow);
  const systemId = resolveTrialSystemId(resolvedRow);
  const subsystemId = resolveTrialSubsystemId(resolvedRow);
  const subSubSystemId = resolveTrialSubSubSystemId(resolvedRow);
  return {
    ...catalogue,
    system: systemId || catalogue['system'],
    subsystem: subsystemId || catalogue['subsystem'],
    sub_sub_system: subSubSystemId || catalogue['sub_sub_system'],
    app_req_status: '',
    date_field: dateStr,
    backup_location: '',
    backup_file_format: '',
    backup_file_name: '',
  };
}

export function itemHandlingExtractionPatchFromSaved(
  saved: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return patchFromSavedPayload(
    saved,
    'itemHandlingExtractionInfo',
    (row) => ({ ...row }),
  );
}

function isRestorationPayloadBucket(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return 'restoration' in (value as object);
}

function findItemHandlingRestorationWrapperRow(
  saved: Record<string, unknown>,
): Record<string, unknown> | null {
  const direct = saved['itemHandlingRestorationInfo'];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  for (const key of Object.keys(saved)) {
    const bucket = saved[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      continue;
    }
    const nested = (bucket as Record<string, unknown>)['itemHandlingRestorationInfo'];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }

  return null;
}

/** Raw restoration row from draft wrapper or `json_data` system bucket. */
export function findRestorationJsonRow(
  saved: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
  systemOptions: SegSelectOption[] = [],
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') return null;

  const fromWrapper = findItemHandlingRestorationWrapperRow(saved);
  if (fromWrapper) return fromWrapper;

  const preferredKey = resolveSystemPayloadKey(
    resolveTrialSystemId(trialRow),
    trialRow,
    systemOptions,
  );

  const keysToTry = [
    preferredKey,
    ...Object.keys(saved).filter(
      (key) =>
        key !== 'detail' &&
        key !== 'requestBackupInfo' &&
        isRestorationPayloadBucket(saved[key]),
    ),
  ];

  for (const key of [...new Set(keysToTry)]) {
    const bucket = saved[key];
    if (!isRestorationPayloadBucket(bucket)) continue;

    const tabRow = bucket['restoration'];
    if (tabRow && typeof tabRow === 'object' && !Array.isArray(tabRow)) {
      return tabRow as Record<string, unknown>;
    }
  }

  return null;
}

export interface RestorationPreferenceRef {
  ship: string;
  system: string;
  subsystem: string;
}

export function parseRestorationPreferencesList(
  raw: unknown,
): RestorationPreferenceRef[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (row): row is Record<string, unknown> =>
        !!row && typeof row === 'object' && !Array.isArray(row),
    )
    .map((row) => ({
      ship: row['ship'] != null ? String(row['ship']) : '',
      system: row['system'] != null ? String(row['system']) : '',
      subsystem: row['subsystem'] != null ? String(row['subsystem']) : '',
    }))
    .filter((row) => row.ship);
}

/** `restoration_preferences` from trial `json_data` drives Ship Suggested Backup. */
export function extractRestorationPreferencesFromSaved(
  saved: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
  systemOptions: SegSelectOption[] = [],
): RestorationPreferenceRef[] {
  const restorationRow = findRestorationJsonRow(saved, trialRow, systemOptions);
  if (restorationRow?.['restoration_preferences']) {
    return parseRestorationPreferencesList(
      restorationRow['restoration_preferences'],
    );
  }

  if (saved?.['restoration_preferences']) {
    return parseRestorationPreferencesList(saved['restoration_preferences']);
  }

  return [];
}

export function buildCompatibleBackupQueryParamsForPreference(
  ctx: {
    formValues: Record<string, unknown>;
    trialRow: Record<string, unknown> | null | undefined;
    mmdTypeOptions: SegSelectOption[];
    preference: RestorationPreferenceRef;
  },
): CompatibleBackupQueryParams | null {
  const trialWithShip = {
    ...(ctx.trialRow ?? {}),
    ship_id: ctx.preference.ship,
  };
  const formWithIds = {
    ...ctx.formValues,
    system: ctx.preference.system || ctx.formValues['system'],
    subsystem: ctx.preference.subsystem || ctx.formValues['subsystem'],
  };

  return buildCompatibleBackupQueryParams(
    {
      formValues: formWithIds,
      trialRow: trialWithShip,
      mmdTypeOptions: ctx.mmdTypeOptions,
    },
    { requireShipId: true, includeMmdType: false },
  );
}

export function buildSegCatalogueParamsForPreference(
  preference: RestorationPreferenceRef,
  formValues: Record<string, unknown>,
): Record<string, string | number> | null {
  const shipId = preference.ship;
  const systemId = preference.system || String(formValues['system'] ?? '');
  const subsystemId =
    preference.subsystem || String(formValues['subsystem'] ?? '');

  if (!shipId || !systemId || !subsystemId) {
    return null;
  }

  return {
    ship_id: shipId,
    system_id: systemId,
    subsystem_id: subsystemId,
  };
}

export function extractSegCatalogueApiRows(
  response: unknown,
): Record<string, unknown>[] {
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
    const results = (data as Record<string, unknown>)['results'];
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

export function mapCatalogueRowToShipSuggestedBackupItem(
  row: Record<string, unknown>,
  shipLabel: string,
): ShipSuggestedBackupItem {
  const id = row['id'];
  return {
    id: id != null && id !== '' ? Number(id) : undefined,
    ship_name: shipLabel || String(row['ship_name'] ?? ''),
    file_name: String(
      row['image_name'] ?? row['mmd_id'] ?? row['name'] ?? row['serial_no'] ?? '-',
    ),
    extraction_format: resolveItemHandlingExtractionFormatLabel(
      row['extraction_format'] ?? row['media_type'] ?? row['mmd_type'] ?? '-',
    ),
    image_url: row['image_url'] ? String(row['image_url']) : undefined,
  };
}

export function mapPreferenceToShipSuggestedPlaceholder(
  preference: RestorationPreferenceRef,
  shipLabel: string,
): ShipSuggestedBackupItem {
  return {
    ship_name: shipLabel || preference.ship,
    file_name: '-',
    extraction_format: '-',
  };
}

export function mergeShipSuggestedBackupItems(
  items: ShipSuggestedBackupItem[],
): ShipSuggestedBackupItem[] {
  const seen = new Set<string>();
  const merged: ShipSuggestedBackupItem[] = [];

  for (const item of items) {
    const key = [
      item.ship_name,
      item.file_name,
      item.extraction_format,
      item.id ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

/** Map trial `json_data` restoration bucket or draft wrapper into restoration form controls. */
export function mapRestorationBucketToItemHandlingForm(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const systemRaw = row['system'] ?? row['system_id'] ?? '';
  const subRaw =
    row['subsystem'] ?? row['subsystem_id'] ?? row['sub_system'] ?? '';

  return {
    system: systemRaw !== '' ? String(systemRaw) : '',
    subsystem: subRaw !== '' ? String(subRaw) : '',
    mmd_typeos: String(row['mmd_typeos'] ?? ''),
    interface: String(row['interface'] ?? ''),
    size: String(row['size'] ?? ''),
    application: String(row['application'] ?? ''),
    name: String(row['name'] ?? ''),
    application_version: String(row['application_version'] ?? ''),
    part_no_mother_board: String(row['part_no_mother_board'] ?? ''),
    pattern_no_selected_mmd: String(row['pattern_no_selected_mmd'] ?? ''),
    date_field: String(row['landing_date'] ?? row['date_field'] ?? '').slice(0, 10),
    backup_location: String(row['location'] ?? row['backup_location'] ?? ''),
    backup_file_format: String(
      row['backup_file_format'] ?? row['extraction_format'] ?? '',
    ),
    backup_file_name: String(row['backup_file_name'] ?? row['dart_no'] ?? ''),
    app_req_status: String(row['app_req_status'] ?? ''),
  };
}

export function itemHandlingRestorationPatchFromSaved(
  saved: Record<string, unknown> | null | undefined,
  trialRow?: Record<string, unknown> | null,
  systemOptions: SegSelectOption[] = [],
): Record<string, unknown> | null {
  const tabRow = findRestorationJsonRow(saved, trialRow, systemOptions);
  if (!tabRow) return null;

  const mapped = mapRestorationBucketToItemHandlingForm(tabRow);
  mapped['system'] = resolveSystemIdForForm(
    mapped['system'],
    trialRow,
    systemOptions,
  );
  return hasPatchValues(mapped) ? mapped : null;
}
