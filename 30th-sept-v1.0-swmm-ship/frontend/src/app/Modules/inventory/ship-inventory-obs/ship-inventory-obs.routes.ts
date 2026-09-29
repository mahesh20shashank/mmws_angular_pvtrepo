import { Routes } from "@angular/router";
import { ObsShell } from "./shell/obs-shell/obs-shell";
import { roleGuard } from "../../../Core/auth/guards/auth-guard";

export const SHIP_INVENTORY_OBS_ROUTES: Routes = [
  {
    path: "",
    component: ObsShell,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () => import("./dashboard/obs-dashboard").then((m) => m.ObsDashboard),
      },
      {
        path: "search",
        loadComponent: () => import("./search/item-search/item-search").then((m) => m.ItemSearch),
      },
      {
        path: "search/add",
        loadComponent: () => import("./search/spare-add/spare-add").then((m) => m.SpareAdd),
      },
      {
        // Must stay ahead of "search/:id" below, or the ":id" param route swallows it.
        path: "search/add-existing",
        loadComponent: () =>
          import("./search/spare-add-existing/spare-add-existing").then((m) => m.SpareAddExisting),
      },
      {
        path: "search/issue-multiple",
        loadComponent: () => import("./search/multi-issue/multi-issue").then((m) => m.MultiIssue),
      },
      {
        path: "search/:id",
        loadComponent: () => import("./search/spare-detail/spare-detail").then((m) => m.SpareDetail),
      },
      {
        path: "search/:id/edit",
        loadComponent: () => import("./search/spare-edit/spare-edit").then((m) => m.SpareEdit),
      },
      {
        path: "return",
        loadComponent: () => import("./returns/return-list/return-list").then((m) => m.ReturnList),
      },

      // Ship Inventory ▾ — Maintainer Spare Requests
      {
        path: "requisitions/routine",
        loadComponent: () =>
          import("./requisitions/requisition-list/requisition-list").then((m) => m.RequisitionList),
        data: { kind: "routine", title: "Maintainer Spare Request - Routine DART" },
      },
      {
        path: "requisitions/defect",
        loadComponent: () =>
          import("./requisitions/requisition-list/requisition-list").then((m) => m.RequisitionList),
        data: { kind: "defect", title: "Maintainer Spare Request - Defect DART" },
      },
      {
        path: "requisitions/:kind/issue",
        loadComponent: () =>
          import("./requisitions/requisition-issue/requisition-issue").then((m) => m.RequisitionIssue),
      },

      // Internal Transactions ▾
      // The two row-detail routes that used to sit here - and ONLY the routes - have been
      // removed. `transactions/survey/:id` (SurveyDetails) and `transactions/demand/:id`
      // (DemandDetails) were reachable by clicking a grid row and by nothing else, and both
      // queue screens now put their action on the row itself instead.
      //
      // THE TWO COMPONENTS ARE DELIBERATELY KEPT AND ARE NOW UNREFERENCED. So are
      // `ObsApiService.getSurveyEntry` / `submitSurveyDetails` / `getDemandEntry` /
      // `submitDemandDetails`, and so are the two back-end completion actions they call -
      // `survey_details/<pk>/complete/` and `demandgenerate/`. Both of those write real records
      // (a completed survey plus a follow-on demand, and a completed demand plus a follow-on
      // receive), and they now have no caller anywhere in the front end. Until a replacement
      // path for completing a survey and a demand is agreed, the ship cannot complete either
      // from this application. That is deliberate and temporary, and it is stated here as well
      // as in the change record so it cannot be lost.
      //
      // Do not confuse these with the same-named components under `shore-inventory-wed` - they
      // are different classes on different routes and are untouched.
      {
        path: "transactions/survey",
        loadComponent: () => import("./transactions/survey-list/survey-list").then((m) => m.SurveyList),
      },
      {
        path: "transactions/demand",
        loadComponent: () => import("./transactions/demand-list/demand-list").then((m) => m.DemandList),
      },
      {
        path: "transactions/iif",
        loadComponent: () => import("./transactions/iif-list/iif-list").then((m) => m.IifList),
      },

      // History
      {
        path: "history",
        loadComponent: () => import("./history/history-page/history-page").then((m) => m.HistoryPage),
      },

      // References ▾
      {
        path: "references/masters",
        // Masters initialises the ship's whole inventory and now carries a
        // delete that clears a department's spares, so it is four roles only. Hiding the menu
        // entry is not enough on its own - the URL is still typeable - and without this the page
        // would render and then be refused endpoint by endpoint in a scatter of 403 toasts. The
        // server (`users.permissions.CanUseMastersPage`) is still the real gate.
        canActivate: [roleGuard("HEAD OF DEPARTMENT", "DY HOD", "SHIPADMIN", "ADMIN")],
        loadComponent: () =>
          import("./references/masters-page/masters-page").then((m) => m.MastersPage),
      },
      {
        path: "references/about",
        loadComponent: () => import("./references/about-page/about-page").then((m) => m.AboutPage),
      },

      // Dashboard "View more" drill-downs
      {
        path: "spares-issued-to-maintainers",
        loadComponent: () => import("./dashboard/issue-status-list/issue-status-list").then((m) => m.IssueStatusList),
        data: { kind: "to-maintainers", title: "Spares Issued to Maintainers" },
      },
      {
        path: "spares-issued-on-tyloan",
        loadComponent: () => import("./dashboard/issue-status-list/issue-status-list").then((m) => m.IssueStatusList),
        data: { kind: "ty-loan", title: "Spares Issued on Ty Loan" },
      },
      {
        path: "spares-returned",
        loadComponent: () =>
          import("./dashboard/spares-returned-list/spares-returned-list").then((m) => m.SparesReturnedList),
      },
      {
        path: "spares-less-than-50",
        loadComponent: () => import("./dashboard/spare-status-list/spare-status-list").then((m) => m.SpareStatusList),
        data: { kind: "less-than-50", title: "Spares < 50% in Inventory" },
      },
      {
        path: "d787j-deficiency",
        loadComponent: () => import("./dashboard/spare-status-list/spare-status-list").then((m) => m.SpareStatusList),
        data: { kind: "d787j-deficiency", title: "D787J Deficiency" },
      },
      {
        path: "critical-spare-list",
        loadComponent: () =>
          import("./dashboard/critical-spare-list/critical-spare-list").then((m) => m.CriticalSpareList),
      },
    ],
  },
];
