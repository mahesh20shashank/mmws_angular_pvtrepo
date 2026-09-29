import { SpareItem } from "../../../operational-maintenance/action-forms/action-forms.model";
import { ParentInventory } from "./requisition.model";

/** Where Raise DART on either queue screen hands off to - the single-DART form, so that every
 * spare in one selection is covered by ONE DART number, because they were consumed on one
 * defect. Declared once here rather than twice in the two components. */
export const DART_FORM_ROUTE = "/afterAuth/op-maintenance/defect/defect";

/** The value that must be STORED in `dart.DartSpare.inventory_type` for a spare handed off from
 * one of these two queues, so the storekeeper's `Maintainer Spare Request - Defect DART` list
 * can leave it out. The row still DISPLAYS `OBS` on the DART form - this is the stored value
 * alone, carried on `SpareItem.dartInventoryType`. It matches
 * `obs.services.OBS_INTERNAL_INVENTORY_TYPE` on the server, which is the value the queue
 * screens' own raise path writes too, so the two paths cannot disagree. */
export const OBS_INTERNAL_INVENTORY_TYPE = "OBS_INTERNAL";

/** The three refusals a Raise DART can meet before the hand-off, written once for both screens.
 * Each names the state, and each names what to do instead - none of the three may be a silent
 * no-op, because a button that does nothing when pressed is the one outcome an operator cannot
 * diagnose. */
export const NOTHING_SELECTED_MESSAGE =
  "Select at least one spare before raising a DART.";
export const EVERY_ROW_HAS_DART_MESSAGE =
  "Every selected spare already carries a DART No, so there is nothing to raise. Use Send to Cart (MO/WED) to move them on.";
export const SOME_ROWS_HAVE_DART_MESSAGE =
  "One or more selected spares already carry a DART No. Select only spares showing pending, or send the ones that already have a DART to the MO/WED cart instead.";

/** The one refusal wording both queue screens use when a bulk DART raise spans more than one
 * Equipment Class, declared once here rather than twice in the two components so the two can
 * never drift apart.
 *
 * The rule itself is the reference application's - `surveylist.js` refuses with
 * "Please select same Equipment Class." and `demandlist.js` with "Please select spares from the
 * same Equipment Class." (R7 Section 6.4). Two wordings for one rule is the defect, not the
 * rule, so neither string is carried across: this one is written in the target's own voice and
 * states the fix as well as the failure, which is what WCAG 3.3.3 asks for.
 *
 * It is a bulk-only rule. A per-row raise is one row and therefore one class by definition. */
export const SAME_EQUIPMENT_CLASS_MESSAGE =
  "Select spares from one Equipment Class. A DART is raised against one equipment, so spares from more than one class cannot share a DART - raise them separately.";

export interface SurveyEntry {
  id: string;
  patternNumber: string;
  dartNumber: string;
  description: string;
  quantity: number;
  category: string;
  equipmentClass: string;
  critical: boolean;
  authority: string;
  parentInventory: ParentInventory;
  /** What the INcatting Status column renders — "Not INcatted" when `awaitingIncatting` is
   * true, otherwise the pre-existing "IIF" or "OK". */
  incattingStatus: string;
  /** The IIF gate. True when this row's spare has an unresolved Due-for-IIF record, in which
   * case the row cannot be ticked, its row action is disabled, and the server refuses a DART or
   * a cart send for it. Distinct from the back end's `is_iif`, which is set on the
   * import-shortfall path only and gates nothing. */
  awaitingIncatting: boolean;
  /** Whether this row carries a real DART number, and therefore which of the two row actions it
   * shows - Raise DART when false, Send to Cart when true. The two are mutually exclusive per
   * row, which is the reference's own rule (R7 Section 6.1).
   *
   * It is NOT `!!dartNumber`. The resolved `dartNumber` can be the sentinel "pending", and the
   * reference additionally treats "None" and an em dash as "no DART yet". The adapter decides
   * this once for both screens so a row can never show one button here and the other there. */
  hasDart: boolean;
  /** The `obs.Spares` primary key behind this queue row - NOT the row's own `id`, which is the
   * Survey or Demand pk. It is what a seeded DART form needs as each spare's `pk`, because that
   * is the value `SpareSelectionModal` puts there for an OBS spare and the value the form's own
   * Remove button reads back. Derived in the adapter from the `spare` field the list payload has
   * always carried - it is not a new wire field. */
  sparePk: string;
}

export interface SurveyDetailsPayload {
  surveyNumber: string;
  quantitySurveyed: number;
  surveyReportDate: string;
  remarks: string;
}

export interface DemandEntry {
  id: string;
  patternNumber: string;
  description: string;
  quantity: number;
  category: string;
  equipmentClass: string;
  critical: boolean;
  authority: string;
  parentInventory: ParentInventory;
  incattingStatus: string;
  /** The Due for Demand half of the same IIF gate — see SurveyEntry. */
  awaitingIncatting: boolean;
  dartNumber: string;
  /** The Due for Demand half of the same row-state discriminator — see SurveyEntry. */
  hasDart: boolean;
  /** The Due for Demand half of the spare primary key — see SurveyEntry. */
  sparePk: string;
}

export interface DemandDetailsPayload {
  quantityDemanded: number;
  demandNumber: string;
  demandDate: string;
  remarks: string;
}

/** The fields a queue row must supply to be seeded into the DART form. Written as a `Pick`
 * rather than a union of the two entry types so the helper below cannot quietly start depending
 * on something only one of the two screens has. */
type DartSeedSource = Pick<
  SurveyEntry,
  "sparePk" | "patternNumber" | "description" | "quantity" | "equipmentClass" | "authority"
>;

/** Turn a queue selection into the exact rows the single-DART form expects, for both screens,
 * in one place.
 *
 * THE SHAPE IS NOT NEGOTIABLE AND THIS IS WHERE THIS CHANGE WOULD FAIL QUIETLY.
 * `DefactForm.submit` builds its three payload arrays by branching on `sourceTab`, so a row
 * without one lands in NONE of them: the DART would save carrying no spares at all and nobody
 * would be told. Every key below is the key `SpareSelectionModal` itself writes on its OBS tab,
 * copied from that method rather than inferred - `item_code`, `item_desc`, `inventoryType`,
 * `crp_category`, `sourceTab`, `qtyRequired` and `pk`, plus the modal-grid display fields a
 * queue row can honestly supply.
 *
 * `crp_category` is empty because a queue row genuinely has none - it is the WED inventory type
 * the DART spare-picker reads from the ILMS/WLMS source of truth, and nothing on Due for Survey
 * or Due for Demand carries it. The form's `WED Inventory Type` cell is blank for these rows,
 * which is the truthful rendering of "not known here".
 *
 * ROWS ARE MERGED BY SPARE. Two queue rows can be two Survey lines for the same spare, and the
 * form keys its own grid - and its Remove button - on `pk`. Seeding both would give the form
 * two rows it cannot tell apart, so removing one would remove both. They are merged into one
 * line with the quantities added, which is also what one DART for one spare should say. */
export function buildDartSeedSpares(rows: readonly DartSeedSource[]): SpareItem[] {
  const bySpare = new Map<string, SpareItem>();
  for (const row of rows) {
    const existing = bySpare.get(row.sparePk);
    if (existing) {
      existing.qtyRequired = (existing.qtyRequired ?? 0) + row.quantity;
      continue;
    }
    bySpare.set(row.sparePk, {
      // the modal-grid display fields, as far as a queue row can supply them
      equipmentClass: row.equipmentClass,
      patternNo: row.patternNumber,
      itemDesc: row.description,
      heldQty: row.quantity,
      authority: row.authority,
      // the normalised fields the selected-spares grid and the submit payload read
      item_code: row.patternNumber,
      item_desc: row.description,
      inventoryType: "OBS",
      crp_category: "",
      sourceTab: "OBS",
      qtyRequired: row.quantity,
      pk: row.sparePk,
      // and the origin marker, which is stored but never displayed
      dartInventoryType: OBS_INTERNAL_INVENTORY_TYPE,
    });
  }
  return [...bySpare.values()];
}

export interface IifEntry {
  id: string;
  patternNumber: string;
  description: string;
  quantity: number;
  category: string;
  equipmentClass: string;
  critical: boolean;
  authority: string;
  parentInventory: ParentInventory;
}

// Widened to keep everything `verify-pattern/` already sends. The
// adapter used to take four of the eleven keys and throw the rest away, so a caller could
// tell THAT a pattern number matched but never WHICH source of truth answered, nor that the
// source disagreed with the category the caller expected. The back end computed all of it
// already — this only stops it being discarded on the way in.
//
// `source` is one of the four the back end names: "ITEM" (ILMS_item), "MO_SOT"
// (ILMS_mo_item_sot), "WLMS" (WLMS_wlmsspare) or "WED_SOT" (WLMS_wed_item_sot), in that
// lookup order, first hit wins.
export type VerifyPatternSource = "ITEM" | "MO_SOT" | "WLMS" | "WED_SOT";

export interface VerifyPatternResult {
  matched: boolean;
  itemCode?: string;
  description?: string;
  category?: string;
  /** Which source of truth answered. Absent when nothing matched. */
  source?: VerifyPatternSource;
  /** The source's own CRP category, mapped onto the application's category values. */
  crpCategory?: string;
  /** The category the caller asked the back end to compare against, if it sent one. */
  expectedCategory?: string;
  /** True when an `expectedCategory` was sent and the source disagreed with it. */
  categoryMismatch?: boolean;
  /** The source's denomination — `item_deno` on the MO side, `denom_id` on the WED side. */
  denomination?: string;
}
