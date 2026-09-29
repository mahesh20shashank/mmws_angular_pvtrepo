export const SEG_TRIALS_API = 'api/data/seg/trials/';

export interface SegTrialsPageMeta {
  availablePages: string[];
  page: string;
  viewer?: string;
}

export function extractSegTrialsPageMeta(
  response: unknown,
  fallbackPages: string[] = [],
): SegTrialsPageMeta {
  const res = response as Record<string, unknown> | null | undefined;
  const availablePages = Array.isArray(res?.['available_pages'])
    ? res['available_pages'].map((page) => String(page))
    : fallbackPages;

  return {
    availablePages,
    page: String(res?.['page'] ?? availablePages[0] ?? ''),
    viewer: res?.['viewer'] != null ? String(res['viewer']) : undefined,
  };
}

export function buildSegTrialsPageUrl(
  tab: string,
  extraParams?: Record<string, string | undefined | null>,
): string {
  const params = new URLSearchParams({ tab });

  if (extraParams) {
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value != null && String(value).trim() !== '') {
        params.set(key, String(value));
      }
    });
  }

  return `${SEG_TRIALS_API}?${params.toString()}`;
}

export function formatSegTrialsTabLabel(
  pageKey: string,
  labelMap: Record<string, string>,
): string {
  const key = pageKey.trim().toLowerCase();
  return (
    labelMap[key] ??
    labelMap[pageKey] ??
    pageKey.charAt(0).toUpperCase() + pageKey.slice(1)
  );
}

export function matchesSegTrialsTab(
  tab: string,
  kind: 'hod' | 'seg',
): boolean {
  const key = tab.trim().toLowerCase();
  if (kind === 'hod') {
    return key === 'hod' || key.includes('hod');
  }
  return (
    key === 'seg' ||
    key.includes('seg_request') ||
    (key.includes('seg') && key.includes('review'))
  );
}
