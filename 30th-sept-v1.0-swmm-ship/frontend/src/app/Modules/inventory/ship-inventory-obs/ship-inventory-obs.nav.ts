import { resolveCmmsApiUrl } from "../../../../environments/api-url";
import { InventoryTabItem } from "../shared/models/inventory-nav.model";

const OBS_BASE = "/afterAuth/inventory/ship-inventory-obs";

/** The "Download Template Excel Sheets" submenu that stood here offered two
 * static assets under `frontend/public/assests/` — `D787J_import_spares.xlsx` and
 * `Ship_Inventory_Template_Excel_Sheet_MO_Items.xlsx`. Both are retired. They were split by
 * authority rather than by department, carried no data validation and no guidance sheet, disagreed
 * with each other on the column list (nineteen columns against twenty, `MO DEMAND NO` in place of
 * the two D787J columns) and breached the CAPITALS rule in their own sample data. The templates a
 * user downloads now come from `GET onboard-spares/download-template/`, on the Import Data tab of
 * References > Masters, scoped to that user's own department. Two competing download paths must
 * not coexist. The two files stay on disk under `public/assests/` and nothing links to them.
 *
 * The Spares Import Rules PDF below is unaffected and stays exactly where it is. */

/** Real static file — `backend/media/obs/osms_documentation.pdf` — served by Django's `static()`
 * helper at `MEDIA_URL` (`swmm/urls.py`, unconditional, not gated behind `DEBUG`). Must be an
 * absolute backend-origin URL: a bare `/media/...` href resolves against the Angular dev server's
 * own origin (which has no such file) instead of the API host. */
export const SPARES_IMPORT_RULES_PDF_URL = `${resolveCmmsApiUrl()}media/obs/osms_documentation.pdf`;

export const SHIP_INVENTORY_OBS_TABS: InventoryTabItem[] = [
  { label: "Dashboard", route: `${OBS_BASE}/dashboard` },
  {
    label: "Ship Inventory",
    children: [
      { label: "Search / Add Spare", route: `${OBS_BASE}/search` },
      { label: "Maintainer Spare Request - Routine DART", route: `${OBS_BASE}/requisitions/routine` },
      { label: "Maintainer Spare Request - Defect DART", route: `${OBS_BASE}/requisitions/defect` },
    ],
  },
  { label: "Return Spares", route: `${OBS_BASE}/return` },
  {
    label: "Internal Transactions",
    children: [
      { label: "Due for Survey - P / R Items", route: `${OBS_BASE}/transactions/survey` },
      { label: "Due for Demand - Cons. Items", route: `${OBS_BASE}/transactions/demand` },
      { label: "Due for IIF - Not INcatted Items", route: `${OBS_BASE}/transactions/iif` },
    ],
  },
  { label: "History", route: `${OBS_BASE}/history` },
  {
    label: "References",
    children: [
      { label: "Spares Import Rules", externalHref: SPARES_IMPORT_RULES_PDF_URL },
      { label: "Masters", route: `${OBS_BASE}/references/masters` },
      { label: "About Ship Inventory", route: `${OBS_BASE}/references/about` },
    ],
  },
];
