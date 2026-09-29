import { patchFromSavedPayload } from '../seg-trial-prefill.shared';

export const SHIP_FEEDBACK_API = 'api/data/ship-feedback/';
export const USER_DETAILS_API = 'api/auth/user-details/';

export function mmdWorkingToFormValue(value: unknown): 'yes' | 'no' {
  if (value === false || value === 'no' || value === 'false' || value === 0) {
    return 'no';
  }
  if (value === true || value === 'yes' || value === 'true' || value === 1) {
    return 'yes';
  }
  return 'yes';
}

export function mmdWorkingToApiValue(value: unknown): boolean {
  return mmdWorkingToFormValue(value) === 'yes';
}

export function buildEmptyShipFeedbackFormData(): Record<string, unknown> {
  return {
    name: '',
    rank: '',
    mmd_working: 'yes',
    mmd_not_working_reason: '',
    seg_rating: '',
    other_comments: '',
  };
}

export function mapTrialRowToShipFeedbackFormData(
  trialRow: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!trialRow) return buildEmptyShipFeedbackFormData();
  return {
    ...buildEmptyShipFeedbackFormData(),
    name: String(trialRow['name'] ?? ''),
    rank: String(trialRow['rank'] ?? ''),
  };
}

export function mapShipFeedbackRowToFormData(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    mmd_working: mmdWorkingToFormValue(row['mmd_working']),
  };

  if (row['name'] != null && String(row['name']).trim() !== '') {
    patch['name'] = row['name'];
  }
  if (row['rank'] != null && String(row['rank']).trim() !== '') {
    patch['rank'] = row['rank'];
  }
  if (row['mmd_not_working_reason'] != null) {
    patch['mmd_not_working_reason'] = row['mmd_not_working_reason'];
  }
  if (row['seg_rating'] != null && row['seg_rating'] !== '') {
    patch['seg_rating'] = String(row['seg_rating']);
  }

  const comments =
    row['other_comments'] ?? row['other_comment'] ?? row['feedback'];
  if (comments != null) {
    patch['other_comments'] = comments;
  }

  return patch;
}

export function resolveOtherCommentsFromForm(
  formData: Record<string, unknown>,
): string | null {
  const raw =
    formData['other_comments'] ?? formData['other_comment'] ?? formData['feedback'];
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  return trimmed === '' ? null : trimmed;
}

export function buildShipFeedbackInfoFromForm(
  formData: Record<string, unknown>,
): Record<string, unknown> {
  const mmdWorking = mmdWorkingToFormValue(formData['mmd_working']);
  const otherComments = resolveOtherCommentsFromForm(formData);

  const segRatingRaw = formData['seg_rating'];
  const segRating =
    segRatingRaw != null && segRatingRaw !== ''
      ? Number(segRatingRaw)
      : segRatingRaw;

  return {
    name:
      typeof formData['name'] === 'string'
        ? formData['name'].trim()
        : formData['name'],
    rank:
      typeof formData['rank'] === 'string'
        ? formData['rank'].trim()
        : formData['rank'],
    mmd_working: mmdWorkingToApiValue(mmdWorking),
    ...(mmdWorking === 'no'
      ? {
          mmd_not_working_reason:
            typeof formData['mmd_not_working_reason'] === 'string'
              ? formData['mmd_not_working_reason'].trim()
              : formData['mmd_not_working_reason'],
        }
      : {}),
    seg_rating: segRating,
    other_comments: otherComments,
  };
}

export function shipFeedbackPatchFromSavedJson(
  saved: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  return patchFromSavedPayload(saved, 'shipFeedbackInfo', mapShipFeedbackRowToFormData);
}

/** POST body for `api/data/ship-feedback/`. */
export function buildShipFeedbackApiPayload(
  trialId: string,
  formData: Record<string, unknown>,
): Record<string, unknown> {
  return {
    trial: trialId,
    ...buildShipFeedbackInfoFromForm(formData),
  };
}

/** Treat existing API row (id/uuid + rating) as submitted feedback. */
export function isShipFeedbackRecordSubmitted(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (!row) return false;
  if (row['submitted'] === true || row['is_submitted'] === true) {
    return true;
  }

  const hasRecord = row['id'] != null || row['uuid'] != null;
  const rating = row['seg_rating'];
  return hasRecord && rating != null && rating !== '';
}

export function resolveShipFeedbackApiRow(
  response: unknown,
): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const obj = response as Record<string, unknown>;
  const data = obj['data'];
  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return data[0] as Record<string, unknown>;
  }

  const results = obj['results'];
  if (Array.isArray(results) && results[0] && typeof results[0] === 'object') {
    return results[0] as Record<string, unknown>;
  }

  const nested = obj['shipFeedbackInfo'];
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }

  if (
    obj['name'] != null ||
    obj['seg_rating'] != null ||
    obj['mmd_working'] != null ||
    obj['other_comments'] != null ||
    obj['feedback'] != null
  ) {
    return obj;
  }

  return null;
}

export function resolveShipFeedbackCreatedById(
  apiRow: Record<string, unknown> | null | undefined,
  fallbackUserId?: string | number | null,
): string | null {
  const id =
    apiRow?.['created_by_id'] ??
    apiRow?.['modified_by_id'] ??
    fallbackUserId;
  if (id == null || id === '') return null;
  return String(id);
}

export function resolveUserDetailsRow(
  response: unknown,
): Record<string, unknown> | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const obj = response as Record<string, unknown>;
  const data = obj['data'];

  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }

  if (Array.isArray(data) && data[0] && typeof data[0] === 'object') {
    return data[0] as Record<string, unknown>;
  }

  if (obj['first_name'] != null || obj['loginname'] != null || obj['rankName'] != null) {
    return obj;
  }

  return null;
}

export function mapUserDetailsToNameRank(
  row: Record<string, unknown>,
): { name: string; rank: string } {
  const first = String(row['first_name'] ?? '').trim();
  const last = String(row['last_name'] ?? '').trim();
  const fullName = [first, last].filter(Boolean).join(' ').trim();
  const name =
    fullName ||
    String(row['name'] ?? row['loginname'] ?? row['display_name'] ?? '').trim();
  const rank = String(
    row['rankName'] ?? row['rank_name'] ?? row['rank'] ?? row['rankCode'] ?? '',
  ).trim();

  return { name, rank };
}
