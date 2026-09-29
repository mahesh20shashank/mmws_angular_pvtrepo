const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Parses an ISO date/datetime string's leading `YYYY-MM-DDTHH:mm` (or bare `YYYY-MM-DD`)
 *  directly off the string rather than via `new Date(...)`, which reads a bare date as UTC
 *  midnight and can shift the displayed day by one depending on the viewer's local timezone —
 *  same reasoning as sfd-management.component.ts's own formatCascadeDate. */
function parseIsoPrefix(value: string): { y: number; mo: number; d: number; h: number; mi: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return { y: Number(y), mo: Number(mo), d: Number(d), h: Number(h ?? 0), mi: Number(mi ?? 0) };
}

/** Every read-only date display in the SFD module funnels through one of these two, instead of
 *  each screen inventing its own ad-hoc format (or, worse, showing the raw ISO string straight
 *  off the API response — e.g. Approval Tracking's "Submitted" column used to). */

/** "10 Aug 2026" — date-only fields with no meaningful time component (installation date,
 *  removal date, approval date, ...). */
export function formatDisplayDate(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = parseIsoPrefix(value);
  if (!parsed) return value;
  return `${String(parsed.d).padStart(2, "0")} ${MONTHS[parsed.mo - 1]} ${parsed.y}`;
}

/** "10/08/2026 10:10" — timestamps where the time is actually meaningful (submitted-at,
 *  created/updated-at, last sync, ...). */
export function formatDisplayDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const parsed = parseIsoPrefix(value);
  if (!parsed) return value;
  const datePart = `${String(parsed.d).padStart(2, "0")}/${String(parsed.mo).padStart(2, "0")}/${parsed.y}`;
  if (!/[T ]\d{2}:\d{2}/.test(value)) return datePart;
  return `${datePart} ${String(parsed.h).padStart(2, "0")}:${String(parsed.mi).padStart(2, "0")}`;
}
