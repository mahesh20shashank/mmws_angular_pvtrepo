/** Shared trial → form mapping for all SEG HTML forms (no assets JSON). */

export type SegSelectOption = { label: string; value: string };

export function isSegTrialApiRow(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row || typeof row !== 'object') return false;
  return !!(
    row['uuid'] ||
    row['trial_type_url'] ||
    row['trial_number'] ||
    row['system_details'] ||
    row['system_ids']
  );
}

export function resolveTrialShipId(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  const ids = resolveTrialShipIds(trialRow);
  return ids[0] ?? '';
}

export function resolveTrialShipIds(
  trialRow: Record<string, unknown> | null | undefined,
): string[] {
  if (!trialRow) return [];
  if (trialRow['ship_id'] != null && trialRow['ship_id'] !== '') {
    return [String(trialRow['ship_id'])];
  }
  const raw = trialRow['ship_ids'] ?? trialRow['ship_name'];
  if (Array.isArray(raw)) {
    return raw.filter((v) => v != null && v !== '').map((v) => String(v));
  }
  return [];
}

export function resolveTrialSystemId(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  const ids = resolveTrialSystemIds(trialRow);
  return ids[0] ?? '';
}

export function resolveTrialSystemIds(
  trialRow: Record<string, unknown> | null | undefined,
): string[] {
  if (!trialRow) return [];
  const ids = trialRow['system_ids'];
  if (Array.isArray(ids) && ids.length) {
    return ids.filter((v) => v != null && v !== '').map((v) => String(v));
  }
  const details = trialRow['system_details'];
  if (Array.isArray(details)) {
    return details
      .map((d) => {
        const row = d as { system_id?: unknown; id?: unknown };
        return row.system_id ?? row.id;
      })
      .filter((id) => id != null && id !== '')
      .map((id) => String(id));
  }
  return [];
}

export function resolveTrialSystemName(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  if (!trialRow) return '';
  const details = trialRow['system_details'];
  if (Array.isArray(details) && details[0]) {
    const row = details[0] as { system_name?: string; name?: string };
    return String(row.system_name ?? row.name ?? '');
  }
  return String(trialRow['system_name'] ?? trialRow['system'] ?? '');
}

export function resolveTrialSubsystemId(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  const ids = resolveTrialSubsystemIds(trialRow);
  return ids[0] ?? '';
}

export function resolveTrialSubsystemIds(
  trialRow: Record<string, unknown> | null | undefined,
): string[] {
  if (!trialRow) return [];
  const ids = trialRow['subsystem_ids'];
  if (Array.isArray(ids) && ids.length) {
    return ids.filter((v) => v != null && v !== '').map((v) => String(v));
  }
  const details = trialRow['subsystem_details'];
  if (Array.isArray(details)) {
    return details
      .map((d) => (d as { subsystem_id?: unknown }).subsystem_id)
      .filter((id) => id != null && id !== '')
      .map((id) => String(id));
  }
  return [];
}

export function resolveTrialSubsystemName(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  if (!trialRow) return '';
  const details = trialRow['subsystem_details'];
  if (Array.isArray(details) && details[0]) {
    const row = details[0] as { subsystem_name?: string; name?: string };
    return String(row.subsystem_name ?? row.name ?? '');
  }
  return String(trialRow['subsystem_name'] ?? trialRow['subsystem'] ?? '');
}

export function resolveTrialSubSubSystemId(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  if (!trialRow) return '';

  const ids = trialRow['equipment_ids'];
  if (Array.isArray(ids) && ids.length) {
    const first = ids.find((id) => id != null && id !== '');
    if (first != null) {
      return String(first);
    }
  }

  const details = trialRow['equipment_details'];
  if (Array.isArray(details) && details.length) {
    for (const item of details) {
      const row = item as {
        equipment_id?: unknown;
        id?: unknown;
        sub_sub_system_id?: unknown;
      };
      const id =
        row.equipment_id ?? row.sub_sub_system_id ?? row.id ?? null;
      if (id != null && id !== '') {
        return String(id);
      }
    }
  }

  const direct =
    trialRow['equipment_id'] ??
    trialRow['sub_sub_system_id'] ??
    trialRow['sub_subsystem_id'];
  return direct != null && direct !== '' ? String(direct) : '';
}

export function resolveTrialSubSubSystemName(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  if (!trialRow) return '';

  const equipmentDetails = trialRow['equipment_details'];
  if (Array.isArray(equipmentDetails) && equipmentDetails.length) {
    const names = [
      ...new Set(
        equipmentDetails
          .map(
            (item) =>
              (item as { name?: string; nomenclature?: string })
                .name ||
              (item as { nomenclature?: string }).nomenclature,
          )
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (names.length) {
      return names.join(', ');
    }
  }

  const hierarchyDetails = trialRow['system_subsystem_details'];
  if (Array.isArray(hierarchyDetails) && hierarchyDetails.length) {
    const names = [
      ...new Set(
        hierarchyDetails
          .map((item) => {
            const row = item as {
              sub_subsystem_name?: string;
              sub_sub_system_name?: string;
              name?: string;
            };
            return (
              row.sub_subsystem_name ||
              row.sub_sub_system_name ||
              row.name ||
              ''
            );
          })
          .filter((name): name is string => Boolean(name)),
      ),
    ];
    if (names.length) {
      return names.join(', ');
    }
  }

  return String(
    trialRow['sub_subsystem_name'] ??
      trialRow['sub_sub_system_name'] ??
      trialRow['sub_sub_system'] ??
      '',
  );
}

export function resolveTrialSectionIds(
  trialRow: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!trialRow) return undefined;
  const raw = trialRow['section_id'] ?? trialRow['section_ids'];
  if (raw == null || raw === '') return undefined;
  const list = Array.isArray(raw) ? raw : [raw];
  const parts = list
    .filter((v) => v != null && v !== '')
    .map((v) => String(v));
  return parts.length ? parts.join(',') : undefined;
}

export function resolveTrialDateString(
  trialRow: Record<string, unknown> | null | undefined,
): string {
  if (!trialRow) return '';
  const trialDate = trialRow['trial_date'] ?? trialRow['proposed_trial_date'];
  return trialDate ? String(trialDate).slice(0, 10) : '';
}

export function mergeTrialOptionsFromTrial(
  options: SegSelectOption[],
  trialRow: Record<string, unknown> | null | undefined,
  kind: 'system' | 'subsystem',
): SegSelectOption[] {
  if (!trialRow) return options;
  const map = new Map(options.map((o) => [String(o.value), o]));

  if (kind === 'system') {
    const details = trialRow['system_details'];
    if (!Array.isArray(details)) return options;
    for (const row of details as {
      system_id?: unknown;
      id?: unknown;
      system_name?: string;
      name?: string;
    }[]) {
      const id = row?.system_id ?? row?.id;
      const name = row?.system_name ?? row?.name;
      if (id == null || id === '') continue;
      const key = String(id);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, { value: key, label: String(name ?? key) });
      } else if (
        name &&
        (existing.label === key || !String(existing.label).trim())
      ) {
        map.set(key, { value: key, label: String(name) });
      }
    }
    return Array.from(map.values());
  }

  const details = trialRow['subsystem_details'];
  if (!Array.isArray(details)) return options;
  for (const row of details as {
    subsystem_id?: unknown;
    id?: unknown;
    subsystem_name?: string;
    name?: string;
  }[]) {
    const id = row?.subsystem_id ?? row?.id;
    const name = row?.subsystem_name ?? row?.name;
    if (id == null || id === '') continue;
    const key = String(id);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { value: key, label: String(name ?? key) });
    } else if (
      name &&
      (existing.label === key || !String(existing.label).trim())
    ) {
      map.set(key, { value: key, label: String(name) });
    }
  }
  return Array.from(map.values());
}

/** Find `wrapperKey` at top level or one level under equipment / empty-key buckets. */
function findSavedWrapperPayload(
  saved: Record<string, unknown>,
  wrapperKey: string,
): Record<string, unknown> | null {
  const direct = saved[wrapperKey];
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }

  for (const key of Object.keys(saved)) {
    const bucket = saved[key];
    if (!bucket || typeof bucket !== 'object' || Array.isArray(bucket)) {
      continue;
    }
    const nested = (bucket as Record<string, unknown>)[wrapperKey];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      return nested as Record<string, unknown>;
    }
  }

  return null;
}

/** Read saved json only when wrapped or not a trial API row. */
export function patchFromSavedPayload(
  saved: Record<string, unknown> | null | undefined,
  wrapperKey: string,
  mapRow: (row: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown> | null {
  if (!saved || typeof saved !== 'object') return null;

  const wrapped = findSavedWrapperPayload(saved, wrapperKey);
  if (wrapped) {
    const mapped = mapRow(wrapped);
    return hasPatchValues(mapped) ? mapped : null;
  }

  if (isSegTrialApiRow(saved)) return null;

  const mapped = mapRow(saved);
  return hasPatchValues(mapped) ? mapped : null;
}

export function hasPatchValues(mapped: Record<string, unknown>): boolean {
  return Object.values(mapped).some(
    (v) =>
      v !== '' &&
      v !== null &&
      v !== undefined &&
      !(Array.isArray(v) && v.length === 0),
  );
}

/** Catalogue block fields prefilled from trial (read-only display on item-handling forms). */
export function mapTrialRowToCatalogueDetailFields(
  trialRow: Record<string, unknown> | null | undefined,
): Record<string, string> {
  if (!trialRow) return {};
  const dateStr = resolveTrialDateString(trialRow);
  return {
    system: resolveTrialSystemName(trialRow),
    subsystem: resolveTrialSubsystemName(trialRow),
    sub_sub_system: resolveTrialSubSubSystemName(trialRow),
    mmd_typeos: String(trialRow['mmd_typeos'] ?? trialRow['os'] ?? trialRow['select_os'] ?? ''),
    interface: String(trialRow['interface'] ?? trialRow['select_interface'] ?? ''),
    size: String(trialRow['size'] ?? trialRow['mmd_size'] ?? trialRow['select_size'] ?? ''),
    application: String(
      trialRow['application'] ?? trialRow['application_name'] ?? '',
    ),
    name: String(trialRow['name'] ?? trialRow['serial_no'] ?? ''),
    application_version: String(trialRow['application_version'] ?? ''),
    part_no_mother_board: String(
      trialRow['part_no_mother_board'] ?? trialRow['oem_part'] ?? '',
    ),
    pattern_no_selected_mmd: String(
      trialRow['pattern_no_selected_mmd'] ??
        trialRow['pattern_number'] ??
        '',
    ),
    date_field: dateStr,
    landing_date: dateStr,
    popup_date: dateStr,
  };
}
