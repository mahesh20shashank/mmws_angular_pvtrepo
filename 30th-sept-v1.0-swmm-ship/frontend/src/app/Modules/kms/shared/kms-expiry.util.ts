import { Certificate } from "../models/kms.model";

export type ExpiryTier = "expired" | "urgent" | "very-soon" | "soon" | "valid" | "none";

/** Mirrors the Django view's day-window thresholds (6 / 3 / 1 months, ~30-day months). */
export function computeExpiryFlags(expiryDate: string | undefined): Pick<Certificate, "expired" | "expiringSoon" | "expiringVerySoon" | "expiringUrgent"> {
  if (!expiryDate) {
    return { expired: false, expiringSoon: false, expiringVerySoon: false, expiringUrgent: false };
  }
  const expiry = new Date(expiryDate);
  const today = new Date();
  const days = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return {
    expired: days < 0,
    expiringSoon: days <= 180,
    expiringVerySoon: days <= 90,
    expiringUrgent: days <= 30,
  };
}

export function expiryTier(cert: Pick<Certificate, "expired" | "expiringSoon" | "expiringVerySoon" | "expiringUrgent">): ExpiryTier {
  if (cert.expired) return "expired";
  if (cert.expiringUrgent) return "urgent";
  if (cert.expiringVerySoon) return "very-soon";
  if (cert.expiringSoon) return "soon";
  return "valid";
}

/** Row background tint per tier, matching the Django template's inline colours. */
export const EXPIRY_ROW_COLOR: Record<ExpiryTier, string> = {
  expired: "#eeeeee",
  urgent: "#ffe5e5",
  "very-soon": "#ffe5cc",
  soon: "#ffffcc",
  valid: "transparent",
  none: "transparent",
};

export const EXPIRY_LABEL: Record<ExpiryTier, string> = {
  expired: "Expired",
  urgent: "Expiring within 1 month",
  "very-soon": "Expiring within 3 months",
  soon: "Expiring within 6 months",
  valid: "Valid",
  none: "—",
};
