import {
  ACTIVITY_PLANNER_ICON,
  BOX_ICON,
  DASHBOARD_GRID_ICON,
  DEFECT_ICON,
  // HELP_ICON, // unused while Help is hidden from the sidebar
  HOME_ICON,
  HOTWORK_ICON,
  INVENTORY_ICON,
  KMS_ICON,
  // KPI_ICON, // unused while KPIs is hidden from the sidebar
  E_LOGBOOKS_ICON,
  OP_MAINT_ICON,
  OP_UTILITIES_ICON,
  // REPORTS_ICON, // unused while Reports is hidden from the sidebar
  ROUTINES_ICON,
  SHIP_CREW_ICON,
  SHIP_INVENTORY_OBS_ICON,
  SHIP_RETURNS_ICON,
  TRAILS_ICON,
  SRAR_ICON,
  TAG_IN_TAG_OUT_ICON,
  TRIAL_RETURNS_ICON,
  HULL_RETURNS_ICON,
  OTHER_RETURNS_ICON,
  OTHER_UTILITIES_ICON,
  SHORE_INVENTORY_MO_ICON,
  SHORE_INVENTORY_WED_ICON,
  NAV_VISIBILITY_ICON,
  USER_ICON,
  HELP_DESK_ICON,
} from "../constants/sidebar-icons";
import { HeaderConfig, NavigationModule } from "./navigation.model";
import {
  createHeader,
  createModule,
  createSidebar,
  createSidebarItem,
  createSidebarWithChildren,
} from "./navigation.builders";
import { SPARES_IMPORT_RULES_PDF_URL } from "../../Modules/inventory/ship-inventory-obs/ship-inventory-obs.nav";

const SECTIONS = {
  operationsMaintenance: "Operations & Maintenance",
  inventoryReturns: "Inventory & Returns",
  utilitiesCrew: "Utilities & Crew",
  admin: "Admin",
} as const;

export const DEFAULT_HEADER: HeaderConfig = createHeader({
  dlGeneration: { enabled: false, route: null },
});

const createHomeHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "overview" },
    actions: {
      label: "Divisional Organisation",
      route: "divisional-organisation",
    },
    reports: { label: "Know Your Regulators", route: "know-your-regulators" },
    dlGeneration: { enabled: true, label: "Gallery", route: "gallery" },
    insights: { enabled: false, route: null },
    configuration: {
      label: "References",
      route: "references/master",
      children: [
        createSidebarItem({
          id: "master",
          label: "Master",
          route: "references/master",
        }),
      ],
    },
  });

const createRefitHeader = (): HeaderConfig =>
  createHeader({
    overview: {
      label: "Dashboard",
      route: "overview",
    },
    configuration: {
      enabled: false,
      route: null,
    },
    actions: {
      label: "DL Monitoring",
      route: "tracking/DL1",
      children: [
        { id: "dl-type", label: "DL I Monitoring", route: "tracking/DL1" },
        {
          id: "import",
          label: "DL II/ AWRF/ SDL Monitoring",
          route: "tracking/DL2",
        },
        { id: "tracking", label: "DL III Monitoring", route: "tracking/DL3" },
      ],
    },
    reports: {
      label: "History",
      route: "history",
    },
    dlGeneration: { enabled: false, route: null },
    insights: {
      enabled: true,
      label: "References",
      route: "references",
      children: [{ id: "master", label: "Master", route: "master" }],
    },
  });

/** KMS repurposes the 6 generic header tabs (the 5 shared ones plus the opt-in
 * `references` slot) as its own screen switcher — Dashboard / Technical Manuals /
 * Certificates / Correspondences▾ / Share Point / References▾ — matching the
 * reference Django app's single-header-block layout exactly, six distinct tabs
 * included. Every tab/child route is marked `absoluteRoute` since they jump between
 * unrelated screens rather than switching sub-views of one screen (the default
 * behavior other modules still use).
 *
 * Key-to-label mapping deliberately doesn't follow each key's usual meaning —
 * it's picked to land tabs in the right left-to-right order given the header's
 * fixed rendering sequence (`HeaderTabKeys` in header.ts): overview, actions,
 * reports, dlGeneration, insights, references, configuration. `dlGeneration` is
 * left disabled (reserved for Op. Maintenance's Routines sub-header elsewhere),
 * so `configuration` ends up last, correctly holding References▾. */
const createKmsHeader = (): HeaderConfig =>
  createHeader({
    overview: {
      label: "Dashboard",
      route: "dashboard/overview",
      absoluteRoute: true,
    },
    actions: {
      label: "Technical Manuals",
      route: "technical/overview",
      absoluteRoute: true,
    },
    reports: {
      label: "Certificates",
      route: "certificates/overview",
      absoluteRoute: true,
    },
    dlGeneration: { enabled: false, route: null },
    insights: {
      label: "Correspondences",
      route: "in-mail/overview",
      absoluteRoute: true,
      children: [
        createSidebarItem({
          id: "in-mail",
          label: "In Mail",
          route: "in-mail/overview",
          absoluteRoute: true,
        }),
        createSidebarItem({
          id: "out-mail",
          label: "Out Mail",
          route: "out-mail/overview",
          absoluteRoute: true,
        }),
      ],
    },
    references: {
      enabled: true,
      label: "Share Point",
      route: "sharepoint/overview",
      absoluteRoute: true,
    },
    configuration: {
      label: "References",
      route: "category-master/overview",
      absoluteRoute: true,
      children: [
        createSidebarItem({
          id: "category-master",
          label: "Category Master",
          route: "category-master/overview",
          absoluteRoute: true,
        }),
      ],
    },
  });

/** Mirrors ship-crew.nav.ts's former standalone tab bar (Dashboard | Watch and
 * Station Bill | Crew Utilities ▾) exactly, now on the shared header instead of
 * the module's own `InventoryTabNav` shell — same three screens, same routes,
 * same dropdown children (Leave / TY Duty Details, Leave Forecast). */
const createShipCrewHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard", absoluteRoute: true },
    actions: {
      label: "Watch and Station Bill",
      route: "watch-station-bill",
      absoluteRoute: true,
    },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: {
      label: "Crew Utilities",
      route: "leave-ty-duty",
      absoluteRoute: true,
      children: [
        createSidebarItem({
          id: "leave-ty-duty",
          label: "Leave / TY Duty Details",
          route: "leave-ty-duty",
          absoluteRoute: true,
        }),
        createSidebarItem({
          id: "leave-forecast",
          label: "Leave Forecast",
          route: "leave-forecast",
          absoluteRoute: true,
        }),
      ],
    },
    references: { enabled: false, route: null },
    configuration: { enabled: false, route: null },
  });

/** Mirrors shore-inventory-wed.nav.ts's SHORE_INVENTORY_WED_TABS (Dashboard | WED
 * Inventory ▾ | Spares Transaction Cart ▾ | Approval | History | References ▾) on
 * the shared header instead of the module's own `InventoryTabNav` shell — same six
 * tabs, same routes, same dropdown children, same left-to-right order. Routes are
 * plain relative segments (not `absoluteRoute`) because the "inventory" module's
 * `baseRoute` doesn't include the "shore-inventory-wed" segment — that's supplied
 * by the `headers`/`headerNestedKeys` mechanism below (same one `ship-returns`
 * uses), which re-prepends the current sub-area segment automatically. */
const createShoreInventoryWedHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: {
      label: "WED Inventory",
      route: "item-search",
      children: [
        createSidebarItem({
          id: "item-search",
          label: "Item Search",
          route: "item-search",
        }),
      ],
    },
    reports: {
      label: "Spares Transaction Cart",
      route: "transactions/survey",
      children: [
        createSidebarItem({
          id: "survey-cart",
          label: "Survey Cart",
          route: "transactions/survey",
        }),
        createSidebarItem({
          id: "pts-approval-cart",
          label: "PTS Approval Cart",
          route: "transactions/pts",
        }),
        createSidebarItem({
          id: "demand-cart",
          label: "Demand Cart",
          route: "transactions/demand",
        }),
        createSidebarItem({
          id: "receive-cart",
          label: "Receive Cart (Outstanding Demands)",
          route: "transactions/receive",
        }),
        createSidebarItem({
          id: "iif-cart",
          label: "IIF Cart",
          route: "transactions/iif",
        }),
        createSidebarItem({
          id: "pts-rio-pending-cart",
          label: "PTS/ RIO Demand - Survey Pending Cart",
          route: "transactions/pts-rio-pending",
        }),
      ],
    },
    dlGeneration: { enabled: true, label: "Approval", route: "approval" },
    insights: { label: "History", route: "history" },
    references: {
      enabled: true,
      label: "References",
      route: "references/masters",
      children: [
        createSidebarItem({
          id: "masters",
          label: "Masters",
          route: "references/masters",
        }),
      ],
    },
    configuration: { enabled: false, route: null },
  });

/** Mirrors ship-inventory-obs.nav.ts's SHIP_INVENTORY_OBS_TABS (Dashboard | Ship
 * Inventory ▾ | Return Spares | Internal Transactions ▾ | History | References ▾)
 * on the shared header instead of the module's own `InventoryTabNav` shell — same
 * six tabs, same structure, including the nested "Download Template Excel
 * Sheets" ▸ D787J / Other Authorites submenu (see Header.toggleChildSubmenu).
 * The three file-download items use `externalHref` (opens directly — see
 * Header.openExternalLink) instead of `route`. Nothing restructured or dropped. */
const createShipInventoryObsHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: {
      label: "Ship Inventory",
      route: "search",
      children: [
        createSidebarItem({
          id: "search-add-spare",
          label: "Search / Add Spare",
          route: "search",
        }),
        createSidebarItem({
          id: "requisitions-routine",
          label: "Maintainer Spare Request - Routine DART",
          route: "requisitions/routine",
        }),
        createSidebarItem({
          id: "requisitions-defect",
          label: "Maintainer Spare Request - Defect DART",
          route: "requisitions/defect",
        }),
      ],
    },
    reports: { label: "Return Spares", route: "return" },
    dlGeneration: {
      enabled: true,
      label: "Internal Transactions",
      route: "transactions/survey",
      children: [
        createSidebarItem({
          id: "due-survey",
          label: "Due for Survey - P / R Items",
          route: "transactions/survey",
        }),
        createSidebarItem({
          id: "due-demand",
          label: "Due for Demand - Cons. Items",
          route: "transactions/demand",
        }),
        createSidebarItem({
          id: "due-iif",
          label: "Due for IIF - Not INcatted Items",
          route: "transactions/iif",
        }),
      ],
    },
    insights: { label: "History", route: "history" },
    references: {
      enabled: true,
      label: "References",
      // the TAB's own landing route is About, not Masters. Masters is now
      // restricted to four roles (see the item below) and the tab is not, so a storekeeper
      // clicking References used to land on a page the role guard immediately bounced them off.
      // About is visible to everyone this tab is visible to.
      route: "references/about",
      children: [
        createSidebarItem({ id: "spares-import-rules", label: "Spares Import Rules", externalHref: SPARES_IMPORT_RULES_PDF_URL }),
        // The "Download Template Excel Sheets" submenu that stood here is
        // retired, together with its twin in ship-inventory-obs.nav.ts. It offered two static
        // assets under public/assests/ that were split by authority rather than by department,
        // carried no data validation and no guidance sheet, and disagreed with each other on the
        // column list. Templates now come from the Import Data tab of References > Masters,
        // scoped to the caller's own department. Two competing download paths must not coexist.
        // The nav keys "download-templates", "template-d787j" and "template-other-authorites"
        // leave the menu with them - see the note on RBAC nav visibility in the CP-02 Frontend
        // Change Set.
        // MASTERS IS FOUR ROLES ONLY. It initialises the ship's whole
        // inventory from a workbook and now carries a delete that clears a department's spares,
        // so it is not a screen for a storekeeper or a maintainer to be standing on.
        //
        // Declared HERE and on no other `id: "masters"` in this file. The same id appears five
        // times, once per header builder - Shore Inventory WED, this one, Shore Inventory MO,
        // Defect and Routine - and gating "the masters item" without qualification would restrict
        // four screens nobody asked about. This is the Ship Inventory OBS one.
        //
        // Upper case, because `AccessControlService.currentRoleName()` upper-cases what it
        // compares against. The role list is the same one `users.permissions.CanUseMastersPage`
        // enforces server side, and the server is the gate - this hides a menu entry that would
        // otherwise lead to a 403.
        createSidebarItem({
          id: "masters",
          label: "Masters",
          route: "references/masters",
          roles: ["HEAD OF DEPARTMENT", "DY HOD", "SHIPADMIN", "ADMIN"],
        }),
        createSidebarItem({ id: "about", label: "About Ship Inventory", route: "references/about" }),
      ],
    },
    configuration: { enabled: false, route: null },
  });

/** Mirrors shore-inventory-mo.nav.ts's SHORE_INVENTORY_MO_TABS (Dashboard | MO
 * Inventory ▾ | Spares Transaction Cart ▾ | Approval | History | References ▾)
 * on the shared header instead of the module's own `InventoryTabNav` shell — same
 * six tabs, same structure, including the nested "As is Transaction" ▸ 8-item
 * submenu (see Header.toggleChildSubmenu). Nothing restructured or dropped — no
 * externalHref items here, every entry is a real route. */
const createShoreInventoryMoHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: {
      label: "MO Inventory",
      route: "vendor-search",
      children: [
        createSidebarItem({
          id: "vendor-search",
          label: "Vendor Search",
          route: "vendor-search",
        }),
        createSidebarItem({
          id: "item-search",
          label: "Item Search",
          route: "item-search",
        }),
      ],
    },
    reports: {
      label: "Spares Transaction Cart",
      route: "transactions/survey",
      children: [
        createSidebarItem({
          id: "survey-cart",
          label: "Survey Cart",
          route: "transactions/survey",
        }),
        createSidebarItem({
          id: "pts-approval-cart",
          label: "PTS Approval Cart",
          route: "transactions/pts",
        }),
        createSidebarItem({
          id: "demand-cart",
          label: "Demand Cart",
          route: "transactions/demand",
        }),
        createSidebarItem({
          id: "receive-cart",
          label: "Receive Cart (Outstanding Demands)",
          route: "transactions/receive",
        }),
        createSidebarItem({
          id: "iif-cart",
          label: "IIF Cart",
          route: "transactions/iif",
        }),
        createSidebarItem({
          id: "pts-rio-pending-cart",
          label: "PTS / RIO Demands - Survey Pending Cart",
          route: "transactions/pts-rio-pending",
        }),
      ],
    },
    dlGeneration: { enabled: true, label: "Approval", route: "approval" },
    insights: { label: "History", route: "history" },
    references: {
      enabled: true,
      label: "References",
      route: "references/transactions/create-cart",
      children: [
        createSidebarItem({
          id: "as-is-transaction",
          label: "As is Transaction",
          children: [
            createSidebarItem({
              id: "as-is-create-cart",
              label: "Create Cart",
              route: "references/transactions/create-cart",
            }),
            createSidebarItem({
              id: "as-is-demand-action",
              label: "Demand Action",
              route: "references/transactions/demand-action",
            }),
            createSidebarItem({
              id: "as-is-issue-authorise",
              label: "Issue Authorise",
              route: "references/transactions/issue-authorise",
            }),
            createSidebarItem({
              id: "as-is-demand-consolidation",
              label: "Demand Consolidation",
              route: "references/transactions/demand-consolidation",
            }),
            createSidebarItem({
              id: "as-is-consumption",
              label: "Consumption",
              route: "references/transactions/consumption",
            }),
            createSidebarItem({
              id: "as-is-survey",
              label: "Survey",
              route: "references/transactions/survey",
            }),
            createSidebarItem({
              id: "as-is-stock-transfer",
              label: "Stock Transfer",
              route: "references/transactions/stock-transfer",
            }),
            createSidebarItem({
              id: "as-is-obs-master",
              label: "OBS Master",
              route: "references/transactions/obs-master",
            }),
          ],
        }),
        createSidebarItem({
          id: "masters",
          label: "Masters",
          route: "references/masters",
        }),
      ],
    },
    configuration: { enabled: false, route: null },
  });

const createOcPlannerHeader = (): HeaderConfig =>
  createHeader({
    overview: { enabled: false, route: null },
    configuration: { label: "Ship Activity Calendar", route: "calendar" },
    actions: { enabled: false, route: null },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });

const createTechnicalDashboardHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    configuration: { enabled: false, route: null },
    actions: { enabled: false, route: null },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });

const createDefectHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Overview", route: "defect/overview" },
    // configuration: { label: "Configuration", route: "defect/configuration" },
    // `activeMatch` keeps the "Actions" tab highlighted on the legacy History, Add
    // Defect/DART, Create DL-II, and Create RA pages reached from within it, even
    // though those pages sit at "op-maintenance/history", "op-maintenance/defect/defect",
    // "op-maintenance/create-dlii", "op-maintenance/create-ra" rather than nested under
    // "defect/actions" (see Header.isTabActive / open-defects.ts goToHistory,
    // goToCreateDefect, createDL, createRA).
    actions: {
      label: "Actions",
      route: "defect/actions",
      activeMatch: ["defect/defect", "create-dlii", "create-ra", "defect/create-multiple-dart"],
      children: [
        { id: "create-single-dart", label: "Create Single DART", route: "defect/defect" },
        { id: "create-multiple-dart", label: "Create Multiple DART", route: "defect/create-multiple-dart" },
        { id: "open-defect-dart", label: "Open Defect / DART", route: "defect/actions" },
      ],
    },
    reports: { label: "Reports", route: "defect/reports" },
    insights: { label: "History", route: "defect/history" },
    configuration: {
      enabled: true,
      label: "Configuration",
      route: "defect/references-masters",
      children: [
        { id: "masters", label: "Masters", route: "defect/references-masters" },
        { id: "exported-files", label: "Exported files", route: "defect/references-exported-files" },
      ],
    },
    // Repurposing the two otherwise-unused generic slots (`dlGeneration`, `references`)
    // for the Defect / Open DARTs tabs — both route to the same Open DARTs register
    // screen (see opm-shell.component.ts TAB_ROUTE_MAP).
  });

const createRoutineHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: {
      label: "Routines",
      route: "search-routines",
      children: [
        createSidebarItem({
          id: "search-routines",
          label: "Search / Plan Routines",
          route: "search-routines",
        }),
        createSidebarItem({
          id: "planned-routines",
          label: "Planned Routines",
          route: "planned-routines",
        }),
        createSidebarItem({
          id: "fuss-triger-list",
          label: "Raised FUSS",
          route: "FUSS-triger-list",
        }),
      ],
    },
    reports: {
      label: "Reports",
      route: "reports/weekly",
      children: [
        createSidebarItem({
          id: "reports-weekly",
          label: "Weekly Maintenance Plan",
          route: "reports/weekly",
        }),
        createSidebarItem({
          id: "reports-fortnightly",
          label: "Fortnightly Maintenance Plan",
          route: "reports/fortnightly",
        }),
        createSidebarItem({
          id: "reports-monthly",
          label: "Monthly Maintenance Plan",
          route: "reports/monthly",
        }),
        createSidebarItem({
          id: "reports-six-monthly",
          label: "Six Monthly Maintenance Plan",
          route: "reports/six-monthly",
        }),
        createSidebarItem({
          id: "reports-yearly",
          label: "Annual Maintenance Plan",
          route: "reports/yearly",
        }),
      ],
    },
    dlGeneration: {
      enabled: true,
      label: "DL I Generation",
      route: "dl1-generation/search-refit",
      children: [
        createSidebarItem({
          id: "dl1-search-refit",
          label: "Search Refit Routines",
          route: "dl1-generation/search-refit",
        }),
        createSidebarItem({
          id: "dl1-generate",
          label: "Generate DL 1",
          route: "dl1-generation/generate",
        }),
      ],
    },
    insights: {
      label: "History",
      route: "history/equipment-routine-history",
      children: [
        createSidebarItem({
          id: "equipment-routine-history",
          label: "Equipment Routine History",
          route: "history/equipment-routine-history",
        }),
        createSidebarItem({
          id: "search-equipment-running-history",
          label: "Equipment Running History",
          route: "history/search-equipment-running-history",
        }),
        createSidebarItem({
          id: "slip-history",
          label: "Slip History",
          route: "history/slip-history",
        }),
        createSidebarItem({
          id: "close-routine-history",
          label: "Close Routine History",
          route: "history/close-routine-history",
        }),
      ],
    },
    configuration: {
      label: "References",
      route: "references/masters",
      children: [
        createSidebarItem({
          id: "masters",
          label: "Masters",
          route: "references/masters",
        }),
        createSidebarItem({
          id: "exported-files",
          label: "Exported files DL 1",
          route: "references/exported-files",
        }),
        createSidebarItem({
          id: "about",
          label: "About Op. Maintenance",
          route: "references/about-us",
        }),
      ],
    },
  });

// e-Logbooks is still under development — no app-level header tabs while it
// only renders the under-development placeholder.
const createHiddenHeader = (): HeaderConfig =>
  createHeader({
    overview: { enabled: false, route: null },
    actions: { enabled: false, route: null },
    configuration: { enabled: false, route: null },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });

// Op Utilities' own header — mirrors Django's tank/tank_header.html tab bar
// (Onboard POL Status / Slip Calculator / Endurance Calculator). Onboard POL
// Status has its own inner tab bar (Dashboard / RAS Monitor / History / Tank
// Masters — see OnboardPolStatus) one level below this.
const createOpUtilitiesHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Onboard POL Status", route: "onboard-pol-status" },
    actions: { label: "Slip Calculator", route: "slip-calculator" },
    configuration: { label: "Endurance Calculator", route: "endurance-calculator" },
    reports: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });

const createSrarHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    configuration: { label: "Masters", route: "masters" },
    actions: { label: "Transaction", route: "transaction" },
    reports: { label: "History", route: "history" },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });

const TRIAL_INT_MASTER_CHILDREN = [
  { id: "master-equipments", label: "Equipments", route: "master/equipments" },
  { id: "master-equipment-oil-mapping", label: "Equipment Oil Mapping", route: "master/equipment-oil-mapping" },
  { id: "master-satellite-units", label: "Satellite Units", route: "master/satellite-units" },
  { id: "master-sections", label: "Sections", route: "master/sections" },
  { id: "master-tools", label: "Tools", route: "master/tools" },
  { id: "master-trial-types", label: "Trial Types", route: "master/trial-types" },
  { id: "master-system", label: "System", route: "master/system" },
  { id: "master-subsystem", label: "Sub System", route: "master/subsystem" },
  { id: "master-sub-sub-system", label: "Sub Sub System", route: "master/sub-sub-system" },
  { id: "master-linkage-form", label: "Linkage Form", route: "master/linkage-form" },
  { id: "master-parameters-value", label: "Parameters Value", route: "master/parameters-value" },
  { id: "master-parameter-refrence-value", label: "Parameter Reference Value", route: "master/parameter-refrence-value" },
  { id: "master-sfd-equipmen-mapping", label: "SFD Equipment Mapping", route: "master/sfd-equipmen-mapping" },
  { id: "master-equipmwnt-map-image", label: "Equipment Map Image", route: "master/equipmwnt-map-image" },
  { id: "master-boat-master", label: "Boat Master", route: "master/boat-master" },
  { id: "master-deck-master", label: "Deck Master", route: "master/deck-master" },
  { id: "master-refit-master", label: "Refit Master", route: "master/refit-master" },
  { id: "master-strakes-master", label: "Strakes Master", route: "master/strakes-master" },
  { id: "master-form-permission", label: "Form Permission", route: "master/form-permission" },
];

const createTrialReturnsHeader = (): HeaderConfig =>
  createHeader({
    overview: {
      enabled: false,
      route: null,
    },
    actions: {
      label: "Transaction",
      route: "transaction",
    },
    configuration: {
      label: "Masters",
      route: "master/equipments",
      children: TRIAL_INT_MASTER_CHILDREN,
    },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });
const createTrialsHeader = (): HeaderConfig => createTrialReturnsHeader();

const createHotworkHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: {
      label: "Transactions",
      route: "manage-hotwork",
      children: [
        {
          id: "raise-hotwork-req",
          label: "Raise Hotwork Requisition",
          route: "raise-requisition",
        },
        {
          id: "req-approval-pending",
          label: "Requisitions - Approval Pending",
          route: "requisitions-approval-pending",
        },
        {
          id: "monitor-approved-req",
          label: "Monitor Approved Requisitions",
          route: "monitor-approved-requisitions",
        },
      ],
    },
    reports: {
      label: "Action",
      route: "inbox",
      children: [
        { id: "inbox", label: "Inbox", route: "inbox" },
        { id: "outbox", label: "Outbox", route: "outbox" },
      ],
    },
    dlGeneration: { enabled: false, route: null },
    insights: { label: "History", route: "history" },
    configuration: { enabled: false, route: null },
  });

const createTagInOutHeader = (): HeaderConfig =>
  createHeader({
    overview: { label: "Dashboard", route: "dashboard" },
    actions: { label: "Tag Out", route: "tag-out" },
    reports: { label: "Tag In", route: "tag-in" },
    dlGeneration: {
      enabled: true,
      label: "Approval",
      route: "tag-out-approval",
      children: [
        {
          id: "tag-out-approval",
          label: "Approve Tag Out",
          route: "tag-out-approval",
        },
        {
          id: "tag-in-approval",
          label: "Approve Tag In",
          route: "tag-in-approval",
        },
      ],
    },
    insights: { label: "History", route: "history" },
    configuration: { enabled: false, route: null },
  });

const createHullReturnsHeader = (): HeaderConfig =>
  createHeader({
    overview: { enabled: false, route: null },
    configuration: { enabled: false, route: null },
    actions: { enabled: false, route: null },
    reports: { enabled: false, route: null },
    dlGeneration: { enabled: false, route: null },
    insights: { enabled: false, route: null },
  });
export const NAVIGATION_CONFIG: NavigationModule[] = [
  createModule({
    id: "home",
    title: "Home",
    section: "",
    baseRoute: "home",
    sidebar: createSidebar({
      id: "home",
      label: "Home",
      route: "overview",
      icon: HOME_ICON,
    }),
    header: createHomeHeader(),
    headers: {},
  }),
  createModule({
    id: "activity",
    title: "Activity Planner",
    section: SECTIONS.operationsMaintenance,
    baseRoute: "activity",
    sidebar: createSidebar({
      id: "activity",
      label: "Activity Planner",
      route: "calendar",
      icon: ACTIVITY_PLANNER_ICON,
    }),
    header: createOcPlannerHeader(),
    headers: {},
  }),
  createModule({
    id: "technical-dashboard",
    title: "Technical Dashboard",
    section: SECTIONS.operationsMaintenance,
    baseRoute: "technical-dashboard",
    sidebar: createSidebar({
      id: "technical-dashboard",
      label: "Technical Dashboard",
      route: "dashboard",
      icon: DASHBOARD_GRID_ICON,
    }),
    header: createTechnicalDashboardHeader(),
    headers: {},
  }),
  // createModule({
  //   id: "divisional_Organisation",
  //   title: "Divisional Organisation",
  //   section: SECTIONS.operations,
  //   baseRoute: "divisional_Organisation",
  //   sidebar: createSidebar({
  //     id: "divisional_Organisation",
  //     label: "Divisional Organisation",
  //     route: "overview",
  //     icon: USERS_ICON,
  //   }),
  // }),
  createModule({
    id: "ship",
    title: "Ship Configuration",
    section: SECTIONS.operationsMaintenance,
    baseRoute: "ship",
    sidebar: createSidebar({
      id: "ship",
      label: "Ship Configuration",
      route: "overview",
      icon: BOX_ICON,
    }),
    header: createHeader({
      dlGeneration: { enabled: false, route: null },
      insights: { enabled: false, route: null },
      references: {
        enabled: true,
        label: "SFD References",
        route: "sfd-references",
      },
    }),
    headers: {},
    headerTabOrder: [
      "overview",
      "configuration",
      "actions",
      "reports",
    ],
  }),
  createModule({
    id: "op-maintenance",
    section: SECTIONS.operationsMaintenance,
    title: "Operational Maintenance",
    baseRoute: "op-maintenance",
    sidebar: createSidebarWithChildren({
      id: "op-maintenance",
      label: "Operations Maintenance",
      route: "defect/overview",
      icon: OP_MAINT_ICON,
      children: [
        createSidebarItem({
          id: "defect",
          label: "Defect",
          route: "overview",
          icon: DEFECT_ICON,
        }),
        createSidebarItem({
          id: "routine",
          label: "Routines",
          route: "dashboard",
          icon: ROUTINES_ICON,
        }),
        createSidebarItem({
          id: "op-utilities",
          label: "Op Utilities",
          route: "onboard-pol-status",
          icon: OP_UTILITIES_ICON,
        }),
        createSidebarItem({
          id: "e-logbooks",
          label: "e-Logbooks",
          icon: E_LOGBOOKS_ICON,
        }),
      ],
    }),
    header: createDefectHeader(),
    headers: {
      defect: createDefectHeader(),
      routine: createRoutineHeader(),
      "op-utilities": createOpUtilitiesHeader(),
      "e-logbooks": createHiddenHeader(),
    },
    headerNestedKeys: ["routine", "op-utilities", "e-logbooks"],
    headerTabOrders: {
      defect: ["overview", "configuration", "actions", "reports", "insights"],
    },
  }),
  createModule({
    id: "inventory",
    title: "Inventory",
    section: SECTIONS.inventoryReturns,
    baseRoute: "inventory",
    sidebar: createSidebarWithChildren({
      id: "inventory",
      label: "Inventory",
      icon: INVENTORY_ICON,
      children: [
        createSidebarItem({
          id: "ship-inventory-obs",
          label: "Ship Inventory - OBS",
          icon: SHIP_INVENTORY_OBS_ICON,
        }),
        createSidebarItem({
          id: "shore-inventory-mo",
          label: "Shore Inventory - MO",
          icon: SHORE_INVENTORY_MO_ICON,
        }),
        createSidebarItem({
          id: "shore-inventory-wed",
          label: "Shore Inventory - WED",
          icon: SHORE_INVENTORY_WED_ICON,
        }),
      ],
    }),
    // All three inventory sub-modules are now on the shared header — none of
    // them render `InventoryTabNav` any more (see MainLayout's
    // INVENTORY_MODULE_TABS, now empty and kept only as the documented
    // opt-out mechanism for a future sub-module that needs it).
    headers: {
      "ship-inventory-obs": createShipInventoryObsHeader(),
      "shore-inventory-mo": createShoreInventoryMoHeader(),
      "shore-inventory-wed": createShoreInventoryWedHeader(),
    },
  }),
  createModule({
    id: "refit_dashboard",
    title: "Refit Maintenance",
    section: SECTIONS.operationsMaintenance,
    baseRoute: "refit_dashboard",
    sidebar: createSidebar({
      id: "refit_dashboard",
      label: "Refit Maintenance",
      route: "overview",
      icon: DASHBOARD_GRID_ICON,
    }),
    header: createRefitHeader(),
  }),
  createModule({
    id: "ship-returns",
    title: "Ship Returns",
    section: SECTIONS.inventoryReturns,
    baseRoute: "ship-returns",
    header: createSrarHeader(),
    headers: {
      srar: createSrarHeader(),
      returns: createTrialReturnsHeader(),
      "hull-returns": createHullReturnsHeader(),
      "other-returns": createHullReturnsHeader(),
    },
    sidebar: createSidebarWithChildren({
      id: "ship-returns",
      label: "Ship Returns",
      icon: SHIP_RETURNS_ICON,
      children: [
        createSidebarItem({
          id: "srar",
          label: "SRAR",
          route: "srar",
          icon: SRAR_ICON,
        }),
        createSidebarItem({
          id: "returns",
          label: "Trial Returns",
          route: "returns",
          icon: TRIAL_RETURNS_ICON,
        }),
        createSidebarItem({
          id: "hull-returns",
          label: "Hull Returns",
          route: "hull-returns",
          icon: HULL_RETURNS_ICON,
        }),
        createSidebarItem({
          id: "other-returns",
          label: "Other Returns",
          route: "other-returns",
          icon: OTHER_RETURNS_ICON,
        }),
      ],
    }),
  }),
  createModule({
    id: "trials",
    title: "Trials",
    section: SECTIONS.inventoryReturns,
    baseRoute: "ship-returns",
    sidebar: createSidebar({
      id: "trials",
      label: "Trials Requisitions",
      route: "trials",
      icon: TRAILS_ICON,
    }),
    header: createTrialsHeader(),
  }),
  createModule({
    id: "other-utilities",
    title: "Other Utilities",
    section: SECTIONS.utilitiesCrew,
    baseRoute: "other-utilities",
    header: createHotworkHeader(),
    headers: {
      hotwork: createHotworkHeader(),
      "tag-in-tag-out": createTagInOutHeader(),
    },
    sidebar: createSidebarWithChildren({
      id: "other-utilities",
      label: "Other Utilities",
      icon: OTHER_UTILITIES_ICON,
      children: [
        createSidebarItem({
          id: "hotwork",
          label: "HotWork",
          route: "hotwork/dashboard",
          icon: HOTWORK_ICON,
        }),
        createSidebarItem({
          id: "tag-in-tag-out",
          label: "Tag In / Tag Out",
          route: "tag-in-tag-out/dashboard",
          icon: TAG_IN_TAG_OUT_ICON,
        }),
      ],
    }),
  }),
  createModule({
    id: "kms",
    title: "Knowledge Management",
    section: SECTIONS.utilitiesCrew,
    baseRoute: "kms",
    sidebar: createSidebar({
      id: "kms",
      label: "KMS",
      tooltip: "Knowledge Management System",
      route: "dashboard/overview",
      icon: KMS_ICON,
    }),
    header: createKmsHeader(),
  }),
  createModule({
    id: "Ship_Crew_and_HR",
    title: "Ship Crew",
    section: SECTIONS.utilitiesCrew,
    baseRoute: "Ship_Crew_and_HR",
    sidebar: createSidebar({
      id: "Ship_Crew_and_HR",
      label: "Ship Crew",
      route: "dashboard",
      icon: SHIP_CREW_ICON,
    }),
    header: createShipCrewHeader(),
  }),
  // createModule({
  //   id: "Administration",
  //   title: "Administrator",
  //   section: SECTIONS.admin,
  //   baseRoute: "Administration",
  //   sidebar: createSidebar({
  //     id: "user",
  //     label: "Administrator",
  //     route: "overview",
  //     icon: ADMIN_ICON,
  //   }),
  //   header: createHeader({
  //     overview: { label: "Dashboard", route: "overview", absoluteRoute: true },
  //     actions: { enabled: false, route: null },
  //     reports: { enabled: false, route: null },
  //     dlGeneration: { enabled: false, route: null },
  //     insights: { enabled: false, route: null },
  //     references: { enabled: false, route: null },
  //     configuration: { enabled: false, route: null },
  //   }),
  //   roles: ["SHIPADMIN", "CO"],
  // }),
  createModule({
    id: "Navigation_Visibility",
    title: "Administrator",
    section: SECTIONS.admin,
    baseRoute: "Administration",
    sidebar: createSidebar({
      id: "Navigation_Visibility",
      label: "Nav Visibility",
      route: "nav-visibility",
      icon: NAV_VISIBILITY_ICON,
    }),
    header: createHeader({
      overview: {
        label: "Dashboard",
        route: "nav-visibility",
        absoluteRoute: true,
      },
      actions: { enabled: false, route: null },
      reports: { enabled: false, route: null },
      dlGeneration: { enabled: false, route: null },
      insights: { enabled: false, route: null },
      references: { enabled: false, route: null },
      configuration: {
        enabled: true,
        label: "HR CDF",
        route: "sync-hrcdf",
        absoluteRoute: true,
      },
    }),
    roles: ["SHIPADMIN", "CO"],
  }),
  createModule({
    id: "User_List",
    title: "Administrator",
    section: SECTIONS.admin,
    baseRoute: "Administration",
    sidebar: createSidebar({
      id: "User_List",
      label: "Users",
      route: "user-list",
      icon: USER_ICON,
    }),
    header: createHeader({
      overview: {
        label: "Users Details",
        route: "user-list",
        absoluteRoute: true,
      },
      actions: { enabled: false, route: null },
      reports: { enabled: false, route: null },
      dlGeneration: { enabled: false, route: null },
      insights: { enabled: false, route: null },
      references: { enabled: false, route: null },
      configuration: { enabled: false, route: null },
    }),
    roles: ["SHIPADMIN", "CO"],
  }),
  // createModule({
  //   id: "Audit_and_Logs",
  //   title: "Audit & Logs",
  //   section: SECTIONS.admin,
  //   baseRoute: "Audit & Logs",
  //   sidebar: createSidebar({
  //     id: "Audit_and_Logs",
  //     label: "Audit & Logs",
  //     route: "overview",
  //     icon: AUDIT_ICON,
  //   }),
  //   roles: ["admin"],
  // }),
  // createModule({
  //   id: "Help",
  //   title: "Help",
  //   section: SECTIONS.admin,
  //   baseRoute: "Help",
  //   sidebar: createSidebar({
  //     id: "Help",
  //     label: "Help",
  //     route: "overview",
  //     icon: HELP_ICON,
  //   }),
  // }),
  createModule({
    id: "Ticket_Management",
    title: "Help-Desk Tickets",
    section: SECTIONS.admin,
    baseRoute: "ticket-management",
    sidebar: createSidebar({
      id: "Ticket_Management",
      label: "Help Desk",
      route: "dashboard",
      icon: HELP_DESK_ICON,
    }),
    header: createHeader({
      overview: { label: "Dashboard", route: "dashboard" },
      actions: { enabled: false, route: null },
      reports: { enabled: false, route: null },
      dlGeneration: { enabled: false, route: null },
      insights: { enabled: false, route: null },
      references: { enabled: false, route: null },
      configuration: { enabled: false, route: null },
    }),
    // Code written by Unknown: was `roles: ["SHIPADMIN", "CO"]` — a second, hardcoded gate
    // independent of the backend Nav Visibility matrix (`AccessControlService.canAccess()` checks
    // both; a module needs to pass each). That meant an admin granting this module's nav key
    // ("help_desk") to another role via the Nav Visibility screen still couldn't actually unlock
    // it here, since this array kept blocking it regardless. Removed so the matrix is the single
    // authoritative source for this module, same as every other non-admin-restricted one.
  }),
];
