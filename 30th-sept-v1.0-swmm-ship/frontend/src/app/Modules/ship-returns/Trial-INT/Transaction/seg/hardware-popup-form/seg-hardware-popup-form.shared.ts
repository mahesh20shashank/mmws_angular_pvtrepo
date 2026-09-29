export type HardwarePopupSelectOption = { label: string; value: string };

export const SEG_HARDWARE_POPUP_DEFECT_TYPE_OPTIONS = [
  { label: 'Hardware', value: 'hardware' },
  { label: 'Software', value: 'software' },
];

import {
  isSegTrialApiRow,
  mergeTrialOptionsFromTrial,
  patchFromSavedPayload,
  resolveTrialDateString,
  resolveTrialSectionIds,
  resolveTrialShipId,
  resolveTrialSubsystemId,
  resolveTrialSystemId,
} from '../seg-trial-prefill.shared';

export {
  isSegTrialApiRow as isHardwarePopupTrialApiRow,
  mergeTrialOptionsFromTrial as mergeHardwarePopupOptionsFromTrial,
  patchFromSavedPayload,
  resolveTrialDateString,
  resolveTrialSectionIds,
  resolveTrialShipId,
  resolveTrialSubsystemId,
  resolveTrialSystemId,
};

function resolveShipProposedDateString(
  row: Record<string, unknown> | null | undefined,
): string {
  if (!row) return '';
  const raw = row['ship_proposed_date'];
  return raw != null && String(raw).trim() !== ''
    ? String(raw).slice(0, 10)
    : '';
}

export function buildEmptyHardwarePopupFormData(): Record<string, unknown> {
  return {
    defect_type: '',
    ship_name: '',
    system: '',
    sub_system: '',
    sub_sub_system: '',
    mmd_type: '',
    description: '',
    popup_date: '',
    dart_no: '',
    ship_proposed_date: '',
  };
}

export function mapTrialRowToHardwarePopupFormData(
  trialRow: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!trialRow) {
    return buildEmptyHardwarePopupFormData();
  }

  const trialDate = trialRow['trial_date'] ?? trialRow['proposed_trial_date'];
  const systemId = resolveTrialSystemId(trialRow);
  const subsystemId = resolveTrialSubsystemId(trialRow);

  return {
    defect_type: String(trialRow['defect_type'] ?? ''),
    ship_name:
      trialRow['ship_id'] != null && trialRow['ship_id'] !== ''
        ? String(trialRow['ship_id'])
        : String(trialRow['ship_name'] ?? ''),
    system: systemId || String(trialRow['system'] ?? ''),
    sub_system: subsystemId || String(trialRow['sub_system'] ?? ''),
    sub_sub_system: String(
      trialRow['sub_sub_system'] ??
        trialRow['equipment_id'] ??
        '',
    ),
    mmd_type: String(trialRow['mmd_type'] ?? ''),
    description: String(trialRow['description'] ?? ''),
    popup_date: trialDate ? String(trialDate).slice(0, 10) : '',
    dart_no: String(trialRow['dart_no'] ?? ''),
    ship_proposed_date: resolveShipProposedDateString(trialRow),
  };
}

export function hardwarePopupPatchFromSavedJson(
  saved: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') {
    return null;
  }

  const fromLegacy = patchFromSavedPayload(
    saved,
    'hardwarePopupInfo',
    mapHardwarePopupRowToFormData,
  );
  if (fromLegacy) {
    return fromLegacy;
  }

  // Flat ship-request repair json_data.
  const flatType = String(saved['backup_type'] ?? '').trim();
  if (
    flatType === 'assistance' ||
    flatType === 'hardware_popup' ||
    saved['defect_type'] != null ||
    saved['description'] != null
  ) {
    return mapHardwarePopupRowToFormData(saved);
  }

  // Nested legacy: { SystemName: { hardware_popup | assistance: {...} } }
  for (const key of Object.keys(saved)) {
    const bucket = saved[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      continue;
    }
    const record = bucket as Record<string, unknown>;
    const row = record['hardware_popup'] ?? record['assistance'];
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      return mapHardwarePopupRowToFormData(row);
    }
  }

  return null;
}

export function mapHardwarePopupRowToFormData(row: any): Record<string, unknown> {
  const systemRaw = row?.system ?? row?.system_id ?? '';
  const subSystemRaw = row?.sub_system ?? row?.subsystem ?? row?.subsystem_id ?? '';
  const subSubSystemRaw =
    row?.sub_sub_system ?? row?.equipment_id ?? row?.equipment ?? '';
  return {
    defect_type: row?.defect_type ?? '',
    ship_name:
      row?.ship_id != null && row?.ship_id !== ''
        ? String(row.ship_id)
        : String(row?.ship_name ?? ''),
    system: systemRaw !== '' ? String(systemRaw) : '',
    sub_system: subSystemRaw !== '' ? String(subSystemRaw) : '',
    sub_sub_system: subSubSystemRaw !== '' ? String(subSubSystemRaw) : '',
    mmd_type: row?.mmd_type ?? '',
    description: row?.description ?? '',
    popup_date: row?.popup_date ?? '',
    dart_no: row?.dart_no ?? '',
    ship_proposed_date: resolveShipProposedDateString(
      row && typeof row === 'object' ? (row as Record<string, unknown>) : null,
    ),
  };
}

/** Keep prefilled MMD type visible when value is lookup id or legacy name string. */
export function mergeHardwarePopupMmdTypeOptions(
  options: HardwarePopupSelectOption[],
  rawValue: string | number | null | undefined,
): HardwarePopupSelectOption[] {
  if (rawValue == null || rawValue === '') {
    return options;
  }
  const value = String(rawValue);
  if (options.some((o) => o.value === value)) {
    return options;
  }
  const byName = options.find((o) => o.label === value);
  if (byName) {
    return options;
  }
  return [...options, { label: value, value }];
}

export function resolveHardwarePopupMmdTypeFormValue(
  options: HardwarePopupSelectOption[],
  rawValue: string | number | null | undefined,
): string {
  if (rawValue == null || rawValue === '') {
    return '';
  }
  const value = String(rawValue);
  if (options.some((o) => o.value === value)) {
    return value;
  }
  const byName = options.find((o) => o.label === value);
  return byName ? byName.value : value;
}

export function buildHardwarePopupInfoFromForm(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    defect_type: formData['defect_type'],
    ship_name: formData['ship_name'],
    system: formData['system'],
    sub_system: formData['sub_system'],
    sub_sub_system: formData['sub_sub_system'],
    mmd_type: formData['mmd_type'],
    description:
      typeof formData['description'] === 'string'
        ? formData['description'].trim()
        : formData['description'],
    popup_date: formData['popup_date'],
    dart_no: formData['dart_no'],
    ship_proposed_date: formData['ship_proposed_date'],
  };
}
