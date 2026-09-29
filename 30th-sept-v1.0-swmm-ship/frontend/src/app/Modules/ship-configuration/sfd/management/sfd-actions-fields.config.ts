import { ChipTone, DropdownOption} from "../../../../shared/components";

export type SfdCategory =
  | "CAT I"
  | "CAT II"
  | "CAT III"
  | "Survey & Demand"
  | "Local Purchase";

export interface CategoryCard {
  id: SfdCategory;
  title: string;
  desc: string;
  color: string;
}

/** The 5 SFD transaction categories, shown as select-cards on the Add/Update screen. */
export const SFD_CATEGORIES: CategoryCard[] = [
  { id: "CAT I", title: "CAT I — Replacement, Same Make & Model", desc: "Replacement, Same Make & Model.", color: "#0088FF" },
  { id: "CAT II", title: "CAT II — Existing in Indian Navy Inventory", desc: "Existing in Indian Navy Inventory.", color: "#22C55E" },
  { id: "CAT III", title: "CAT III — New Induction", desc: "New Induction", color: "#F59E0B" },
  { id: "Survey & Demand", title: "Survey & Demand — Serial Number Change", desc: "Serial Number Change.", color: "#7FB3E0" },
  { id: "Local Purchase", title: "Local Purchase — Purchase Against NAC/ NFC", desc: "Purchase Against NAC/ NFC", color: "#A855F7" },
];

/**
 * Maps each UI category to the `transaction/<slug>/` URL segment it POSTs to, and doubles as the
 * `category` field value sent in the body / expected back on `GET sfd-list/` rows. The exact
 * string the backend stores for `category` isn't confirmed beyond the URL routing itself, so this
 * mirrors that routing exactly (e.g. "cat1", "survey-demand") — adjust if the backend expects a
 * different convention (e.g. "CAT1", "CAT I").
 */
export const CATEGORY_TO_SLUG: Record<SfdCategory, string> = {
  "CAT I": "cat1",
  "CAT II": "cat2",
  "CAT III": "cat3",
  "Survey & Demand": "survey-demand",
  "Local Purchase": "others",
};

const SLUG_TO_CATEGORY: Record<string, SfdCategory> = Object.fromEntries(
  Object.entries(CATEGORY_TO_SLUG).map(([category, slug]) => [slug, category as SfdCategory]),
);

/**
 * The `category` value expected INSIDE the create payload body (`EquipmentTransaction.TransactionCategory`
 * choices in `sfd/models.py`) — distinct from CATEGORY_TO_SLUG, which is only the URL routing segment.
 * `SFDTransactionBaseSerializer.validate()` rejects the request if this doesn't match exactly.
 */
export const CATEGORY_TO_BODY_VALUE: Record<SfdCategory, string> = {
  "CAT I": "cat1",
  "CAT II": "cat2",
  "CAT III": "cat3",
  "Survey & Demand": "survey",
  "Local Purchase": "other",
};

/** Reverses CATEGORY_TO_SLUG for reading the `?category=` query param set by
 * sfd-overview.component.ts's category deep-links — NOT for reading API response data (see
 * categoryFromBodyValue for that; the two conventions differ for Survey & Demand/Local Purchase:
 * "survey-demand"/"others" here vs. "survey"/"other" on the wire). Falls back to "Local Purchase"
 * if unrecognized. */
export function categoryFromSlug(slug: string | null | undefined): SfdCategory {
  return (slug && SLUG_TO_CATEGORY[slug.toLowerCase()]) || "Local Purchase";
}

const BODY_VALUE_TO_CATEGORY: Record<string, SfdCategory> = Object.fromEntries(
  Object.entries(CATEGORY_TO_BODY_VALUE).map(([category, value]) => [value, category as SfdCategory]),
);

/** Reverses CATEGORY_TO_BODY_VALUE for reading the `category`/`transaction_category` field back
 * off `GET sfd-list/` and `GET approval-tracking/` rows — `SFDTransaction.TransactionCategory`
 * really does store "cat1"/"cat2"/"cat3"/"survey"/"other" (confirmed against `sfd/models.py`), not
 * the "survey-demand"/"others" URL-routing slug. Falls back to "Local Purchase" if unrecognized. */
export function categoryFromBodyValue(value: string | null | undefined): SfdCategory {
  return (value && BODY_VALUE_TO_CATEGORY[value.toLowerCase()]) || "Local Purchase";
}

/** The same conceptual "Supplier" field is named differently per category — shared by the component's cascade and the payload builder so both stay in sync. */
export function supplierFieldName(category: SfdCategory | null): string {
  if (category === "CAT III") return "Supplier Name";
  if (category === "Survey & Demand" || category === "Local Purchase") return "Equipment Supplier Name";
  return "Supplier";
}

export type FieldControlType =
  | "Dropdown"
  | "Text"
  | "Number"
  | "Date"
  | "Decimal"
  | "Checkbox"
  | "Auto Fetch";

/** "Ship Master" marks fields resolved from the picked Compartment's own master record
 * (CompartmentMaster, via onCompartmentPicked) — distinct from "CMMS" (equipment/system master
 * data) even though both are non-user-entered. */
export type SourceBadge = "CMMS" | "User" | "Ship Master";

/** Every dropdown source an action-form field can bind to. All but "location" are loaded live from the backend (see SfdActionsService.loadReferenceData) — there is no static/mock data left. */
export type OptionSetKey =
  | "equipment"
  | "model"
  | "nomenclature"
  | "oem"
  | "supplier"
  | "oemPart"
  | "location"
  | "compartment"
  | "shelfLife"
  | "section"
  | "type";

export interface ActionFieldSpec {
  name: string;
  type: FieldControlType;
  required: boolean;
  source: SourceBadge;
  editable: boolean;
  optionsKey?: OptionSetKey;
  /** CAT I and Survey & Demand/Local Purchase only: which of the form's two equipment-info
   *  sections this field renders under (see FIELD_SECTIONS/displayFieldGroups,
   *  sfd-management.component.ts). Unset on CAT II/III — CAT II deliberately kept its original
   *  flat field set (explicit product direction) despite sharing CAT I's shape otherwise, and CAT
   *  III ("New Induction") has no "equipment being replaced" to describe in the first place, so
   *  neither has a genuine old-vs-new split to make. */
  group?: "old" | "new";
}

export type OptionSetMap = Partial<Record<OptionSetKey, DropdownOption[]>>;

/**
 * `EquipmentTransaction.Location` choice codes (`sfd/models.py`) — the one option set with a
 * fixed value/label pair defined server-side rather than sourced from a list endpoint. The "5",
 * "11", "12", "14", "21", "0" legacy/"Unknown" codes are omitted from new-entry forms.
 */
export const LOCATION_OPTIONS: DropdownOption[] = [
  { label: "Port, Aft", value: "1" },
  { label: "Port, Forward", value: "2" },
  { label: "Starboard, Forward", value: "3" },
  { label: "Starboard, Aft", value: "4" },
];

/** `liveSets` is populated by the component from `SfdActionReferenceData` (real API data, no mocks). */
export function optionsFor(key: OptionSetKey | undefined, liveSets: OptionSetMap): DropdownOption[] {
  if (!key) return [];
  if (key === "location") return LOCATION_OPTIONS;
  return liveSets[key] ?? [];
}

/** Turns a field spec's display name (e.g. "Equipment Serial No") into a safe reactive-form control key. */
export function controlKey(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, "_");
}

/**
 * CAT I ("Replacement, Same Make & Model") now carries the same Old/New Equipment Info split
 * Survey & Demand already has (explicit product direction) — replacing an old physical unit with
 * an identical new one is the same kind of transaction, just without a serial-number-change
 * framing. "Old Equipment Info" describes the equipment being replaced (catalog identity, plus
 * that unit's own install record); "New Equipment Info" is the fresh replacement unit's own
 * install details, always hand-entered. Every "old" field is always-locked once the cascade runs,
 * blank or not (see toDisplayField's oldGroupAlwaysLocked) — a value CMMS genuinely has none of
 * belongs under New Equipment Info instead, never a fallback editable pick/type on the old side.
 * Reuses Survey & Demand's exact "new" backend fields (removal_date/authority_of_removal/
 * new_installation_date/new_serial_no/new_service_life — see CAT1Serializer, sfd/source_contract.py)
 * rather than adding a fresh set of columns.
 */
const CAT_1_FIELDS: ActionFieldSpec[] = [
  // Nomenclature deliberately sits right after Equipment Name (not after Model, like every other
  // category) — explicit product direction: "System Name" (injected right after whichever of
  // Equipment/Nomenclature this order puts last — see displayFields' sysField insertion) should
  // land third, not second, on this category's own form.
  { name: "Equipment Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "equipment", group: "old" },
  { name: "Nomenclature", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "nomenclature", group: "old" },
  { name: "Model", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "model", group: "old" },
  { name: "OEM Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oem", group: "old" },
  { name: "Supplier", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "supplier", group: "old" },
  { name: "OEM Part No", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oemPart", group: "old" },
  // "Auto Fetch", not "Text" — dodges isSerialSpec's `/Serial No$|Serial Number$/i` name-pattern
  // match (sfd-management.component.ts), which would otherwise collide with "New Eqpt Serial
  // Number" below (both would be treated as the form's one excluded-from-addForm serial control).
  // Mirrors Survey & Demand's identical "Equipment Serial No" for the same reason. Auto-fetched
  // from the same historical-record cascade Survey & Demand already reads it from (see
  // applyCat1OldEquipmentCascade, sfd-management.component.ts).
  // `required: false` — explicit product direction: this locked/uneditable field has no
  // "(if not auto-fetched)" fallback (removed — the New group's own "New Eqpt Serial Number"
  // below already always captures a serial number by hand every submission, so a second manual
  // entry just for the OLD unit's serial was redundant). Without a fallback, keeping this
  // `required: true` would leave a genuine dead end whenever CMMS's own history doesn't have a
  // serial on record — a locked, blank, mandatory field with no way to fill it in (backend
  // already agrees: `SourceShipEquipmentSerializer.serial_no` is `required=False` too).
  { name: "Equipment Serial No", type: "Auto Fetch", required: false, source: "CMMS", editable: false, group: "old" },
  // Unlike every other category's "Compartment Name" (which keeps a separate, pre-existing
  // carve-out — isFieldEditable's "stays editable in Update mode" rule, needed there because it's
  // the trigger for its own separate pick), CAT I's copy is explicit product direction: locked
  // blank-or-not exactly like the rest of Old Equipment Info. "Compartment Name (New Eqpt)" below
  // is where the operator picks one when the cascade found nothing — see
  // onCompartmentPicked/subscribeCascadeHandlers, sfd-management.component.ts.
  { name: "Compartment Name", type: "Dropdown", required: true, source: "Ship Master", editable: false, optionsKey: "compartment", group: "old" },
  { name: "Deck No", type: "Text", required: true, source: "Ship Master", editable: false, group: "old" },
  { name: "Frame Station", type: "Text", required: true, source: "Ship Master", editable: false, group: "old" },
  { name: "Location", type: "Dropdown", required: true, source: "Ship Master", editable: false, optionsKey: "location", group: "old" },
  // Was `source: "User", editable: true` — now the OLD unit's own recorded install date, fetched
  // the same way Survey & Demand's does (applyCat1OldEquipmentCascade); the fresh replacement's
  // own install date is "Date of Installation (New Eqpt)" below, in the New group.
  { name: "Installation Date", type: "Date", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Installation Remarks", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  // Was `source: "User", editable: true` — same reasoning as Installation Date above. No separate
  // "New" Qty Fitted — the fitted count doesn't change on a same-make/model replacement, matching
  // Survey & Demand's own precedent (no new_qty_fitted field there either).
  { name: "Qty Fitted", type: "Number", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Shelf Life", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "shelfLife", group: "old" },
  { name: "Sub Department", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "section", group: "old" },
  // "Old Equipment Removal Date" — explicit product direction (renamed from the plain "Removal
  // Date" this and Survey & Demand/Local Purchase used to share): disambiguates it from any other
  // "removal date" concept in the app (e.g. the separate Remove-equipment wizard's own field of
  // the same short name) and makes explicit which equipment this date belongs to. Wire name
  // (`removal_date`) and backend validation are unaffected — see buildCreatePayload's oldNewFields.
  { name: "Old Equipment Removal Date", type: "Date", required: true, source: "User", editable: true, group: "new" },
  { name: "Removal Authority", type: "Text", required: true, source: "User", editable: true, group: "new" },
  { name: "New Eqpt Serial Number", type: "Text", required: true, source: "User", editable: true, group: "new" },
  // Not `required: true` — unlike Old Equipment Removal Date/New Eqpt Serial Number/etc. (genuinely separate
  // old-vs-new backend columns, always mandatory), there's only ONE `compartment_name` slot on the
  // wire. Picking here is how the operator satisfies that slot when the Old section's own
  // auto-fetch found nothing — required there, but only reachable here as a fallback, so marking
  // this one unconditionally required too would block submission even on the (normal) case where
  // the Old pick already succeeded. Explicit product direction: this pick does NOT write back onto
  // Old Equipment Info's own "Compartment Name" (unlike the fallback fields below it) — Old must
  // stay genuinely blank/locked, never quietly filled in behind the operator's back by a pick made
  // over here. `buildCreatePayload` (sfd-actions.service.ts) reads whichever of the two actually
  // has a value at submit time instead (Old first, this one as the fallback) — see onCompartmentPicked.
  { name: "Compartment Name (New Eqpt)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "compartment", group: "new" },
  // Same "own control, no mirror-back onto Old" treatment as "Compartment Name (New Eqpt)" above,
  // for the three fields onCompartmentPicked resolves alongside it — Deck No/Location/Frame Station
  // only ever had an Old-group home before now (auto-fetched straight onto the Old controls once a
  // compartment was picked, CAT I included), so an operator picking a compartment that CMMS had
  // never recorded before watched Old Equipment Info silently fill itself in too. `optionsKey:
  // "location"` mirrors the plain "Location" field's own — same LOCATION_OPTIONS list.
  { name: "Deck No (New Eqpt)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  { name: "Location (New Eqpt)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "location", group: "new" },
  // Frame Station is a compound From/To pair, not a single control (see isFrameRangeSpec/
  // frameFromControl/frameToControl's own docs, sfd-management.component.ts) — this fallback gets
  // its OWN separate pair (newFrameFromControl/newFrameToControl), never reusing Old's, for the
  // same "Old must stay genuinely untouched" reasoning as the fields above.
  { name: "Frame Station (New Eqpt)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  // Base authority_of_installation/authority_date, not new_*-prefixed ones — same base-field
  // mapping Survey & Demand's own "New" group already uses for these two (there's no dedicated
  // "new authority" column; the OLD unit's original install authority isn't re-entered here).
  // Named "(New Eqpt)" (unlike Survey & Demand's own plain "Authority for Installation") and
  // ordered ahead of "Installation Remarks (New Eqpt)" below — explicit product direction.
  { name: "Authority of Installation (New Eqpt)", type: "Text", required: true, source: "User", editable: true, group: "new" },
  { name: "Authority Date", type: "Date", required: true, source: "User", editable: true, group: "new" },
  { name: "Date of Installation (New Eqpt)", type: "Date", required: true, source: "User", editable: true, group: "new" },
  // "Dropdown" + `optionsKey: "shelfLife"` — same catalog picklist Old's own "Shelf Life" uses
  // (not a free-typed number) — explicit product direction: a picked shelf-life value always
  // matches a real catalog option, same as every other "(if not auto-fetched)" fallback field
  // (Model/OEM Name/Supplier/OEM Part No are all Dropdowns too, none free-typed numbers).
  { name: "Shelf Life (New Eqpt)", type: "Dropdown", required: true, source: "User", editable: true, optionsKey: "shelfLife", group: "new" },
  { name: "Enter R|H for SRAR return", type: "Checkbox", required: false, source: "User", editable: false, group: "new" },
  { name: "R|H (Running Hours) as on date", type: "Decimal", required: false, source: "User", editable: true, group: "new" },
  // Same reasoning as "Compartment Name (New Eqpt)" above — only one `installation_remark` slot
  // on the wire (see buildCreatePayload's oldNewFields), so this is a fallback for when the Old
  // group's own "Installation Remarks" came back empty, not a second always-required column.
  // Placed last in the New group (explicit product direction) — everything else above it is the
  // core New Equipment entry sequence; this stays a trailing remarks/notes-style field.
  { name: "Installation Remarks (New Eqpt)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  // "(if not auto-fetched)" fallback fields — same single-slot reasoning as "Compartment Name
  // (New Eqpt)"/"Installation Remarks (New Eqpt)" above, generalised to every other Old
  // Equipment Info field that can genuinely come back blank from CMMS (real historical data, not
  // guaranteed complete — see the Old group's own field-by-field doc comments above). Deliberately
  // NOT named "(New Eqpt)" like Compartment Name/Installation Remarks — for Equipment Serial No
  // and Shelf Life specifically, a "(New Eqpt)" name would read as a duplicate of the *already*
  // existing, semantically DIFFERENT "New Eqpt Serial Number"/"Shelf Life (New Eqpt)" fields
  // above (the freshly-installed unit's own values, always required) — so this whole batch uses
  // one distinct, unambiguous suffix instead. `required: false` throughout, same reasoning as
  // "Compartment Name (New Eqpt)": each is only ever a fallback for its Old counterpart, not an
  // always-mandatory second column. Sub Department now has one too (explicit product direction,
  // overriding its own original "always locked — correct it on RHSI Master instead" comment
  // still on the Old field below): practical fix requested directly on the Add/Update form itself.
  // Wired generically in subscribeCascadeHandlers/mirrorIntoOldControl and
  // clearNomenclatureCascadeFields (sfd-management.component.ts) by matching this suffix, not
  // hardcoded per field name. No "Shelf Life (if not auto-fetched)" here — unlike these, Shelf
  // Life already has a mandatory New-side field ("Shelf Life (New Eqpt)") that's shown and filled
  // in every single time regardless of the Old cascade's own result, so a third "shelf life" box
  // would just be a redundant, confusing dead field — that one mirrors into "Shelf Life" itself
  // instead (see subscribeCascadeHandlers), the same way "Compartment Name (New Eqpt)" does.
  { name: "Model (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "model", group: "new" },
  { name: "OEM Name (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "oem", group: "new" },
  { name: "Supplier (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "supplier", group: "new" },
  { name: "OEM Part No (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "oemPart", group: "new" },
  // No "Equipment Serial No (if not auto-fetched)" here (removed — explicit product direction):
  // "New Eqpt Serial Number" above already always captures a serial number by hand every
  // submission, so a second manual box just for the OLD unit's own serial read as a redundant
  // "same thing twice" ask. Old's own "Equipment Serial No" above is `required: false` now for
  // the same reason — see its own doc comment.
  { name: "Installation Date (if not auto-fetched)", type: "Date", required: false, source: "User", editable: true, group: "new" },
  { name: "Qty Fitted (if not auto-fetched)", type: "Number", required: false, source: "User", editable: true, group: "new" },
  { name: "Sub Department (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "section", group: "new" },
];

/**
 * CAT II ("Existing in Indian Navy Inventory") — explicit product direction: stays CAT I's
 * ORIGINAL flat field set (no Old/New Equipment Info split), even though CAT I itself moved to
 * one above. Otherwise identical to CAT I's pre-split shape, plus its own "Not Listed – Add New
 * Equipment" escape hatch: the equipment can exist in navy inventory without being in THIS ship's
 * own synced CMMS list yet, so "Equipment Name" doubles as a free-text field right in the same
 * dropdown (see SelectInput.allowCustomValue, wired in sfd-management.component.ts's
 * toDisplayField()) instead of needing a separate spec entry here.
 */
const CAT_2_FIELDS: ActionFieldSpec[] = [
  { name: "Equipment Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "equipment" },
  { name: "Model", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "model" },
  { name: "Nomenclature", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "nomenclature" },
  { name: "OEM Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oem" },
  { name: "Supplier", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "supplier" },
  { name: "OEM Part No", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oemPart" },
  { name: "Equipment Serial No", type: "Text", required: true, source: "User", editable: true },
  { name: "Compartment Name", type: "Dropdown", required: true, source: "Ship Master", editable: true, optionsKey: "compartment" },
  { name: "Deck No", type: "Text", required: true, source: "Ship Master", editable: false },
  { name: "Frame Station", type: "Text", required: true, source: "Ship Master", editable: false },
  { name: "Location", type: "Dropdown", required: true, source: "Ship Master", editable: false, optionsKey: "location" },
  { name: "Installation Date", type: "Date", required: true, source: "User", editable: true },
  { name: "Authority for Installation", type: "Text", required: true, source: "User", editable: true },
  { name: "Authority Date", type: "Date", required: true, source: "User", editable: true },
  { name: "Qty Fitted", type: "Number", required: true, source: "User", editable: true },
  { name: "Shelf Life", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "shelfLife" },
  { name: "Enter R|H for SRAR return", type: "Checkbox", required: false, source: "User", editable: false },
  { name: "R|H (Running Hours) as on date", type: "Decimal", required: false, source: "User", editable: true },
  { name: "Sub Department", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "section" },
];

const CAT_3_FIELDS: ActionFieldSpec[] = [
  { name: "Equipment Name", type: "Text", required: true, source: "User", editable: true },
  { name: "Model", type: "Text", required: true, source: "User", editable: true },
  { name: "Nomenclature", type: "Text", required: true, source: "User", editable: false },
  { name: "OEM Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oem" },
  // Right after "OEM Name" (not after "Supplier Name") — explicit product direction: this is
  // OEM Name's own "not listed" fallback (see isNewOemNameSpec/showNewOemName), so it should sit
  // next to the field it's a fallback FOR, not get separated from it by an unrelated column.
  { name: "New OEM Name", type: "Text", required: true, source: "User", editable: true },
  { name: "Supplier Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "supplier" },
  { name: "New OEM Supplier Name", type: "Text", required: true, source: "User", editable: true },
  { name: "New OEM Part No", type: "Text", required: true, source: "User", editable: true },
  { name: "Equipment Serial No", type: "Text", required: true, source: "User", editable: true },
  { name: "Compartment Name", type: "Dropdown", required: true, source: "Ship Master", editable: true, optionsKey: "compartment" },
  { name: "Deck No", type: "Text", required: true, source: "Ship Master", editable: false },
  { name: "Frame Station", type: "Text", required: true, source: "Ship Master", editable: false },
  { name: "Location", type: "Dropdown", required: true, source: "Ship Master", editable: false, optionsKey: "location" },
  { name: "Installation Date", type: "Date", required: true, source: "User", editable: true },
  { name: "Installation Authority", type: "Text", required: true, source: "User", editable: true },
  { name: "Authority Date", type: "Date", required: true, source: "User", editable: true },
  { name: "Qty Fitted", type: "Number", required: true, source: "User", editable: true },
  { name: "Shelf Life", type: "Dropdown", required: true, source: "CMMS", editable: true, optionsKey: "shelfLife" },
  { name: "Add R|H for SRAR return", type: "Checkbox", required: false, source: "User", editable: false },
  { name: "R|H (Running Hours) as on date", type: "Decimal", required: false, source: "User", editable: true },
  { name: "Sub Department", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "section" },
];

/**
 * Several fields below are marked `required: true` even though the latest design mockup shows them
 * without an asterisk (OEM Name, Equipment Supplier Name, OEM Part No, Deck No, Frame Station,
 * Location, Compartment Name, Qty Fitted, Sub Department). This isn't a mockup mismatch by choice —
 * `SurveySerializer.validate()` (sfd/serializers.py) explicitly rejects the request if any of these
 * is falsy/blank, and several of the base fields (deck_no, location, compartment_name,
 * frame_station_from/to) have no `required=False`/`allow_blank` at the DRF field level either.
 * Marking them optional here would just mean every submission 400s with a confusing backend error
 * instead of a clear "required" hint up front.
 *
 * There is NO "Equipment Type" field here (or on CAT I/II/III) by explicit product direction, even
 * though `SFDTransactionBaseSerializer.equipment_type` is still a plain required CharField with no
 * `required=False`/`allow_blank` — every category's create call will 400 with "equipment_type: This
 * field may not be blank." until that's relaxed server-side or a default is supplied some other way.
 */
/** Survey & Demand/Local Purchase field-group headings, in display order — see FIELD_SPECS.group.
 *  Says "System" instead of "Equipment" when Transaction Type is System, matching what the
 *  group's own System Name field switches to (see toDisplayField's sysField). */
export function fieldGroupTitle(key: "old" | "new", type: "Equipment" | "System"): string {
  const noun = type === "System" ? "System" : "Equipment";
  return key === "old" ? `Old ${noun} Info` : `New ${noun} Info`;
}

const SURVEY_DEMAND_FIELDS: ActionFieldSpec[] = [
  { name: "Equipment Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "equipment", group: "old" },
  // Model / OEM Name / OEM Part No were `source: "User"` — which meant isCmmsCascadeLockedField
  // (sfd-management.component.ts) never locked them, however successfully the cascade auto-
  // filled them, contradicting the product ask that picking Equipment + Nomenclature should
  // auto-fill AND lock the "old" equipment's own fields, leaving only "New Equipment Info"
  // (group "new") open for hand entry. `source: "CMMS"` here matches every other "old" field
  // below (Equipment Supplier Name, Deck No, Location, ...) — toDisplayField()'s cmmsLocked
  // still only locks a field once the cascade actually found a value for it (see
  // allowCustomWhenBlank's own doc), so CMMS having nothing on record for e.g. OEM Part No
  // still falls back to a normal editable pick/type, exactly as before.
  { name: "Model", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "model", group: "old" },
  { name: "Nomenclature", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "nomenclature", group: "old" },
  // Every field below through Sub Department is "Auto Fetch" — matches the reference mockup's
  // FIELD_SPECS table exactly. applyNomenclaturePickedCascade()/applySurveyOrLocalPurchaseCascade()
  // (sfd-management.component.ts) resolve all of them — OEM Name / Equipment Supplier Name /
  // OEM Part No / Shelf Life / Equipment Serial No / Deck No / Frame Station / Location /
  // Compartment Name / Installation Date / Installation Remarks / Qty Fitted / Sub Department — from
  // the specific historical ShipEquipment record the picked Equipment + Nomenclature resolve to.
  // That record is real CMMS data and can genuinely lack a value for any one of these fields —
  // toDisplayField()'s cmmsLocked (sfd-management.component.ts) only renders an "Auto Fetch" field
  // readonly once the cascade actually found something for it; otherwise it falls back to a normal
  // editable widget instead of locking the (required) field blank with no way to fill it in by hand.
  { name: "OEM Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oem", group: "old" },
  { name: "Equipment Supplier Name", type: "Auto Fetch", required: true, source: "CMMS", editable: false, optionsKey: "supplier", group: "old" },
  { name: "OEM Part No", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "oemPart", group: "old" },
  // `required: false` — matches CAT_1_FIELDS' identical fix for this same field name: no
  // "(if not auto-fetched)" fallback here (removed — "New Eqpt Serial Number" below already
  // always captures a serial number by hand every submission, so a second manual box just for
  // the OLD unit's own serial was redundant), so this locked/uneditable field must not stay
  // `required: true` — that would be a dead end whenever CMMS's own history has none on record.
  { name: "Equipment Serial No", type: "Auto Fetch", required: false, source: "CMMS", editable: false, group: "old" },
  // Compartment Name is "Dropdown" (not "Auto Fetch") in the v1 reference, but otherwise now
  // locked exactly like every other Old Equipment Info field (explicit product direction: Survey
  // & Demand/Local Purchase follow CAT I's process here too — see CAT_1_FIELDS' own doc on why
  // its "Compartment Name" is locked blank-or-not rather than kept open). Was `editable: true`,
  // relying on isFieldEditable()'s "Compartment Name stays editable in Update mode" carve-out —
  // that carve-out is now narrowed to categories with no genuine Old/New split (CAT II/III) so it
  // no longer applies here either. Placed right after Equipment/System Serial No by explicit
  // product direction. Ported from Aug_15.
  { name: "Compartment Name", type: "Dropdown", required: true, source: "CMMS", editable: false, optionsKey: "compartment", group: "old" },
  { name: "Deck No", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Frame Station", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Location", type: "Auto Fetch", required: true, source: "CMMS", editable: false, optionsKey: "location", group: "old" },
  { name: "Installation Date", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Installation Remarks", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Qty Fitted", type: "Auto Fetch", required: true, source: "CMMS", editable: false, group: "old" },
  { name: "Shelf Life", type: "Auto Fetch", required: true, source: "CMMS", editable: false, optionsKey: "shelfLife", group: "old" },
  // "Auto Fetch"/editable:false — always a locked, mandatory display (never a live pick-from-list
  // here, even when CMMS has nothing for it), same as every other Old field. Originally meant
  // correcting a missing one only ever happened on the RHSI Master page — now also fixable right
  // here via "Sub Department (if not auto-fetched)" below (explicit product direction). See
  // kindForSpec's Sub-Department special case in sfd-management.component.ts.
  { name: "Sub Department", type: "Auto Fetch", required: true, source: "CMMS", editable: false, optionsKey: "section", group: "old" },
  // Renamed from the plain "Removal Date" — see CAT_1_FIELDS' identical note for why.
  { name: "Old Equipment Removal Date", type: "Date", required: true, source: "User", editable: true, group: "new" },
  { name: "Removal Authority", type: "Text", required: true, source: "User", editable: true, group: "new" },
  { name: "New Eqpt Serial Number", type: "Text", required: true, source: "User", editable: true, group: "new" },
  { name: "Date of Installation (New Eqpt)", type: "Date", required: true, source: "User", editable: true, group: "new" },
  // "Dropdown" + `optionsKey: "shelfLife"` — same catalog picklist Old's own "Shelf Life" uses,
  // matching CAT_1_FIELDS' identical fix for this same field name (not a free-typed number).
  { name: "Shelf Life (New Eqpt)", type: "Dropdown", required: true, source: "CMMS", editable: true, optionsKey: "shelfLife", group: "new" },
  { name: "Authority for Installation", type: "Text", required: true, source: "User", editable: true, group: "new" },
  { name: "Authority Date", type: "Date", required: true, source: "User", editable: true, group: "new" },
  { name: "Do You want to add RH for SRAR Return", type: "Checkbox", required: false, source: "User", editable: true, group: "new" },
  { name: "R/H of new eqpt at installation", type: "Decimal", required: false, source: "User", editable: true, group: "new" },
  // Compartment Name (+ the Deck No/Frame Station/Location it drives) is now locked in the Old
  // group same as CAT I — see that field's own doc above — so it needs the identical "(New
  // Eqpt)" fallback quartet CAT I already has (CAT_1_FIELDS), not the "(if not auto-fetched)"
  // suffix the rest of this batch uses: onCompartmentPicked (sfd-management.component.ts) reads
  // these SPECIFICALLY by that suffix to resolve deck/frame/location off the picked compartment,
  // same mechanism as CAT I's own copy. Ported from Aug_15.
  { name: "Compartment Name (New Eqpt)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "compartment", group: "new" },
  { name: "Deck No (New Eqpt)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  { name: "Location (New Eqpt)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "location", group: "new" },
  { name: "Frame Station (New Eqpt)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  // "(if not auto-fetched)" fallback fields — see CAT_1_FIELDS' identical batch for the full
  // reasoning (single-slot fields that can genuinely come back blank from real historical CMMS
  // data, now that this whole Old group locks blank-or-not).
  { name: "Model (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "model", group: "new" },
  { name: "OEM Name (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "oem", group: "new" },
  { name: "Equipment Supplier Name (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "supplier", group: "new" },
  { name: "OEM Part No (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "oemPart", group: "new" },
  // No "Equipment Serial No (if not auto-fetched)" here — matches CAT_1_FIELDS' identical
  // removal (see its own doc comment on the Old "Equipment Serial No" spec above).
  { name: "Installation Date (if not auto-fetched)", type: "Date", required: false, source: "User", editable: true, group: "new" },
  { name: "Installation Remarks (if not auto-fetched)", type: "Text", required: false, source: "User", editable: true, group: "new" },
  { name: "Qty Fitted (if not auto-fetched)", type: "Number", required: false, source: "User", editable: true, group: "new" },
  { name: "Sub Department (if not auto-fetched)", type: "Dropdown", required: false, source: "User", editable: true, optionsKey: "section", group: "new" },
  // No "Shelf Life (if not auto-fetched)" — see CAT_1_FIELDS' identical note: "Shelf Life (New
  // Eqpt)" is already mandatory and shown every time, and mirrors into "Shelf Life" itself.
];

/**
 * Local Purchase now shares the Survey & Demand field set exactly (Model, Shelf Life, Sub
 * Department, Old Equipment Removal Date/Authority, New Eqpt Serial Number, Shelf Life (New Eqpt), the R|H
 * checkbox, etc. all apply here too) — reused directly rather than duplicated. Explicit product
 * direction: the overlap with Survey & Demand is intentional, not a bug.
 */
const OTHERS_FIELDS: ActionFieldSpec[] = SURVEY_DEMAND_FIELDS;

export const FIELD_SPECS: Record<SfdCategory, ActionFieldSpec[]> = {
  "CAT I": CAT_1_FIELDS,
  "CAT II": CAT_2_FIELDS,
  "CAT III": CAT_3_FIELDS,
  "Survey & Demand": SURVEY_DEMAND_FIELDS,
  "Local Purchase": OTHERS_FIELDS,
};

/** Maps a rendered field name (after the Equipment→System swap) to the row key used to prefill it on Update. */
export const PREFILL_FIELD_MAP: { pattern: RegExp; key: keyof SfdActionRow }[] = [
  { pattern: /^(Equipment|System) Name$/, key: "name" },
  { pattern: /^Model$/, key: "model" },
  { pattern: /^Nomenclature$/, key: "nomen" },
  { pattern: /^(New )?OEM Name$/, key: "oem" },
  { pattern: /^(Supplier|Supplier Name|Equipment Supplier Name|New OEM Supplier Name)$/, key: "supplier" },
  { pattern: /OEM Part No$/, key: "part" },
  { pattern: /Serial No$|Serial Number$/, key: "serial" },
  { pattern: /^Deck No$/, key: "deck" },
  { pattern: /^Frame Station$/, key: "frame" },
  { pattern: /^Location$/, key: "location" },
  { pattern: /^Compartment Name$/, key: "compartment" },
  { pattern: /Installation Date$/, key: "installDate" },
  { pattern: /Authority for Installation$|Installation Authority$|Authority of Installation \(New Eqpt\)$/, key: "authority" },
  { pattern: /^Authority Date$/, key: "authorityDate" },
  { pattern: /^Qty Fitted$/, key: "qty" },
  { pattern: /^Shelf Life$/, key: "shelfLife" },
  { pattern: /Running Hours|R\|H|R\/H/, key: "rh" },
  { pattern: /^Sub Department$/, key: "section" },
  // Old Equipment Removal Date / Removal Authority / Date of Installation (New Eqpt) — each its own
  // distinct backend column (see SfdActionRow.removalDate/removalAuthority/newInstallDate's own
  // doc) — listed after the generic "Installation Date$"/"Authority..." patterns above since none
  // of those match these labels anyway (different word order/suffix), so order doesn't matter here.
  { pattern: /^Old Equipment Removal Date$/, key: "removalDate" },
  { pattern: /^Removal Authority$/, key: "removalAuthority" },
  { pattern: /^Date of Installation \(New Eqpt\)$|^Date of Installation \(New System\)$/, key: "newInstallDate" },
  { pattern: /^Shelf Life \(New Eqpt\)$|^Shelf Life \(New System\)$/, key: "newShelfLife" },
];

/** Row shape for the Remove flow's "Active Maintenance Routines & Defect Records" table — populated from `GET sfd-list/{id}/open-dependencies/` (open_defects + maintenance_routines combined). */
export interface DefectRecord {
  id: string;
  type: "Defect" | "Routine";
  desc: string;
  raised: string;
  priority: string;
  status: string;
}

export interface HistoryStat {
  label: string;
  value: string;
  tone?: ChipTone;
}

export const EQUIPMENT_HISTORY_STATS: HistoryStat[] = [
  { label: "Current Status", value: "Operational", tone: "success" },
  { label: "Running Hours", value: "14,280 hrs" },
  { label: "Pending Defects", value: "2", tone: "warning" },
  { label: "Pending Routines", value: "3", tone: "warning" },
];

export interface HistoryRow {
  a: string;
  b: string;
  tag: string;
  tone: ChipTone;
}

export interface HistorySection {
  title: string;
  rows: HistoryRow[];
}

export const EQUIPMENT_HISTORY_SECTIONS: HistorySection[] = [
  {
    title: "Previous Ship(s)",
    rows: [
      { a: "HMS Dauntless (D33)", b: "2016 – 2019", tag: "Transferred", tone: "info" },
      { a: "HMS Diamond (D34)", b: "2019 – 2022", tag: "Transferred", tone: "info" },
    ],
  },
  {
    title: "Installation History",
    rows: [
      { a: "HMS Daring (D32)", b: "Installed 14-03-22", tag: "Op Auth 4471", tone: "success" },
      { a: "HMS Dauntless (D33)", b: "Installed 02-11-19", tag: "Op Auth 3350", tone: "success" },
    ],
  },
  {
    title: "Removal History",
    rows: [{ a: "HMS Diamond (D34)", b: "Removed 28-02-22", tag: "Refit", tone: "warning" }],
  },
  {
    title: "Maintenance History",
    rows: [
      { a: "Quarterly Overhaul", b: "Completed 14-02-26", tag: "Closed", tone: "success" },
      { a: "Annual Survey", b: "Completed 10-11-25", tag: "Closed", tone: "success" },
    ],
  },
  {
    title: "Defect History",
    rows: [{ a: "Excess vibration — main bearing", b: "Rectified 20-02-26", tag: "Rectified", tone: "success" }],
  },
  {
    title: "Pending Defects",
    rows: [
      { a: "Seal seepage — LO circuit", b: "Raised 21-06-26", tag: "Open", tone: "warning" },
      { a: "Coupling alignment drift", b: "Raised 30-06-26", tag: "Open", tone: "warning" },
    ],
  },
  {
    title: "Pending Routines",
    rows: [
      { a: "Half-yearly calibration", b: "Due 15-07-26", tag: "Due Soon", tone: "warning" },
      { a: "Quarterly lubrication check", b: "Due 22-07-26", tag: "Due Soon", tone: "warning" },
      { a: "Annual insulation resistance test", b: "Due 05-08-26", tag: "Scheduled", tone: "info" },
    ],
  },
];

export interface SfdActionRow {
  id: number;
  code: string;
  name: string;
  nomen: string;
  dept: string;
  qty: number;
  maintop: string;
  serial: string;
  /** CAT I/Survey & Demand/Local Purchase only — the NEW equipment's own serial number ("New Eqpt
   *  Serial Number" on the Add form), submitted as its own distinct `new_serial_no` field
   *  (buildCreatePayload, sfd-actions.service.ts) and stored separately on the backend
   *  (`new_equipment_sr_no`) from the OLD equipment's own `serial` above — unlike Deck No/Location/
   *  Compartment Name/Frame Station's own "(New Eqpt)" fallbacks, which collapse into the SAME
   *  single stored value as their Old counterpart and have nothing distinct to preserve here.
   *  CAT II/CAT III have no Old/New split at all, so this is always "" there (their own single
   *  "Equipment Serial No" is what `serial` already holds). Optional only because the SFD_ROWS
   *  demo/fallback rows predate this field; real API rows (mapRawRowToDisplayRow) always set it. */
  newSerial?: string;
  /** CAT I/Survey & Demand/Local Purchase's own "Old Equipment Removal Date"/"Removal Authority"/
   *  "Date of Installation (New Eqpt)" — like newSerial above, each is its own genuinely distinct
   *  backend column (`removal_date`/`authority_of_removal`/`new_installation_date` — confirmed
   *  against SourceShipEquipmentSerializer's Meta.fields), not a value shared with anything on the
   *  Old side. CAT II/CAT III: always "" (no such fields on those categories' forms). */
  removalDate?: string;
  removalAuthority?: string;
  newInstallDate?: string;
  newShelfLife?: string;
  cat: SfdCategory;
  system: string;
  model: string;
  oem: string;
  supplier: string;
  part: string;
  deck: string;
  frame: string;
  location: string;
  compartment: string;
  installDate: string;
  authority: string;
  /** Optional only because the SFD_ROWS demo/fallback rows below predate this field — real API rows
   * (see mapRawRowToDisplayRow) always set it. */
  authorityDate?: string;
  shelfLife: string;
  rh: string;
  section: string;
  type: string;
  /** The record's OWN transaction type ("system" vs "equipment") — distinct from `system`, which is
   * the (possibly unrelated) parent-system NAME an equipment record belongs to. Only real API rows
   * set this (via `mapRawRowToDisplayRow`); mock rows default to `false` (Equipment). */
  isSystemRecord?: boolean;
  /** The Equipment master's own local PK (`row.equipment`/`row.system` off `GET sfd-list/` —
   * whichever this record's own transaction type points at) — what `ems/maintop-pdf/<id>/`
   * actually keys off, distinct from `maintop` (the human-facing Maintop No. shown in the grid).
   * Optional only because mock rows predate this field; real API rows always set it. */
  equipmentMasterId?: number | null;
}

export const SFD_ROWS: SfdActionRow[] = [];

export interface DeletedSfdRow {
  code: string;
  name: string;
  nomen: string;
  date: string;
  auth: string;
  reason: string;
  by: string;
}

export const DELETED_SFD_ROWS: DeletedSfdRow[] = [];

export type ActivityKind = "added" | "removed" | "serialChanged" | "submitted";

export interface RecentActivityRow {
  icon: ActivityKind;
  name: string;
  tag: string;
  tone: ChipTone;
  code: string;
  detail: string;
  date: string;
  by: string;
}

/** `GET recent-activity/`'s `tag` values, mapped to this popup's icon/tone — see
 * `SfdActionsService.loadRecentActivity()`, which is where a raw row is turned into a
 * `RecentActivityRow`. */
export const RECENT_ACTIVITY_TAG_META: Record<string, { icon: ActivityKind; tone: ChipTone }> = {
  Added: { icon: "added", tone: "success" },
  Removed: { icon: "removed", tone: "danger" },
  "Serial Changed": { icon: "serialChanged", tone: "warning" },
  Submitted: { icon: "submitted", tone: "info" },
};

/** Real values from `GET approval-tracking/` are "Pending"/"approved"/"Rejected" (see backend's
 * `ApprovalTrackingAPIView.STATUS_MAPPING`/`_status_label` convention) — "Approved"/"Returned"
 * are kept for tone-map completeness/legacy display only. */
export type ApprovalStatus = "Pending" | "Approved" | "Returned" | "Rejected" | "approved";

/** Display row for the "View Approval Status" grid, mapped from `RawApprovalTrackingRow`. `cat`
 * is the underlying transaction's SFD category ("CAT I", "Survey & Demand", ...), resolved via
 * categoryFromBodyValue(row.transaction_category) — distinct from `row.category`
 * ("Remove"/"Change"), which is the request TYPE the backend groups by, not currently surfaced. */
export interface ApprovalSfdRow {
  id: string;
  eqp: string;
  cat: string;
  by: string;
  date: string;
  status: ApprovalStatus;
  officer: string;
  remarks: string;
  approveDate: string;
  lastUpdatedDate: string;
  /** "remove" | "change" — the exact `category` value `PUT approval-tracking/` needs to know which
   * table (RemoveEquipmentRequest/ChangeEquipmentRequest) to update. Distinct from `cat` (the
   * equipment's own SFD category). */
  requestType: "remove" | "change";
  /** Raw `SFDTransaction.category` body-value ("cat1"/"survey"/...) — round-tripped back as
   * `transaction_category` on resubmit when the edited `cat` display label doesn't map cleanly
   * back through CATEGORY_TO_BODY_VALUE (it's a free-text field in the correction form). */
  transactionCategoryRaw: string;
  /** Only set for `requestType === "remove"` — the full details submitted with the removal
   * request, shown directly in the Approval Detail view (a Remove request has no separate full
   * SFD form to reopen the way a Change request does). */
  equipmentSrNo?: string;
  subDept?: string;
  compartmentName?: string;
  removalDate?: string;
  removalAuthority?: string;
  removalRemark?: string;
  /** See RawApprovalTrackingRow.equipment_ship_id's doc — the real PK "View Full Form"
   *  (openFullFormFromApproval, sfd-management.component.ts) fetches directly. */
  equipmentShipId?: number | null;
}

export const APPROVAL_STATUS_TONE_MAP: Record<ApprovalStatus, ChipTone> = {
  Pending: "warning",
  Approved: "success",
  approved: "success",
  Returned: "info",
  Rejected: "info",
};

/** Display label shown in the grid/detail chip — distinct from the raw `ApprovalStatus` value used for
 * filtering/tone lookup. "Rejected" is displayed as "Returned" (the two are treated as the same outcome). */
export const APPROVAL_STATUS_LABEL_MAP: Record<ApprovalStatus, string> = {
  Pending: "In Progress – INSMA Approval",
  Approved: "Approved",
  approved: "Approved",
  Returned: "Returned",
  Rejected: "Returned",
};

/** The 4 query params `GET sfd-list/` (and `GET sfd-list/filter-options/`) both accept. */
export type SfdListFilterParamKey = "equipment_name" | "nomenclature" | "sub_dept" | "maintop_id";

export interface ActionFilterDef {
  name: string;
  paramKey: SfdListFilterParamKey;
}

/** The 4 Active-list filter dropdowns — both their applied filter (sent as a `sfd-list/` query
 * param) and their option lists (from `sfd-list/filter-options/`, the full active dataset rather
 * than whatever page happens to be loaded) key off the same `paramKey`. */
export const ACTION_FILTER_DEFS: ActionFilterDef[] = [
  { name: "Equipment Name", paramKey: "equipment_name" },
  { name: "Nomenclature", paramKey: "nomenclature" },
  { name: "Sub Dept", paramKey: "sub_dept" },
  { name: "Maintop", paramKey: "maintop_id" },
];
