import { Routes } from "@angular/router";
import { MoShell } from "./shell/mo-shell/mo-shell";
import {
  DEMAND_CART_COLUMNS,
  IIF_CART_COLUMNS,
  PTS_CART_COLUMNS,
  PTS_RIO_PENDING_CART_COLUMNS,
  RECEIVE_CART_COLUMNS,
  SURVEY_CART_COLUMNS,
} from "./cart-list/cart-columns";
import {
  CONSUMPTION_CONFIG,
  OBS_MASTER_CONFIG,
  STOCK_TRANSFER_CONFIG,
} from "./transaction-stub/transaction-stub.configs";

export const SHORE_INVENTORY_MO_ROUTES: Routes = [
  {
    path: "",
    component: MoShell,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () => import("./dashboard/mo-dashboard/mo-dashboard").then((m) => m.MoDashboard),
      },
      {
        path: "vendor-search",
        loadComponent: () => import("./vendor-search/vendor-search").then((m) => m.VendorSearch),
      },
      {
        path: "item-search",
        loadComponent: () => import("./item-search/item-search").then((m) => m.ItemSearch),
      },

      // Spares Transaction Cart ▾
      {
        path: "transactions/survey",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "survey",
          title: "Results - To Be Surveyed",
          columns: SURVEY_CART_COLUMNS,
          showApprovalButton: true,
          helpHtml: `<p class="mb-0">Permanent/Returnable items forwarded here from Ship Inventory for
            survey. Tick rows and use <strong>Send for HOD Approval</strong> before the survey can be
            actioned in ILMS.</p>`,
        },
      },
      {
        path: "transactions/pts",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "pts",
          title: "Raise PTS",
          columns: PTS_CART_COLUMNS,
          showApprovalButton: true,
          helpHtml: `<p class="mb-0">PTS (Prior To Survey) items — critical spares sent for replacement
            before the old item is surveyed. Tick rows and use <strong>Send for HOD Approval</strong>,
            then sync the approved backlog with ILMS.</p>`,
        },
      },
      {
        path: "transactions/demand",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "demand",
          title: "Results - To Be Demand",
          columns: DEMAND_CART_COLUMNS,
          showApprovalButton: true,
          helpHtml: `<p class="mb-0">Consumable items awaiting demand at harbour through ILMS. Tick rows
            and use <strong>Send for HOD Approval</strong> before the demand is raised in ILMS.</p>`,
        },
      },
      {
        path: "transactions/receive",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "receive",
          title: "Results - To Be Receipt",
          columns: RECEIVE_CART_COLUMNS,
          showApprovalButton: false,
          showSyncButton: true,
          syncButtonLabel: "Sync MO Issue Details from ILMS",
          helpHtml: `<p class="mb-0">Items ILMS has marked as issued to MO, awaiting receipt onboard. Use
            <strong>Sync MO Issue Details from ILMS</strong> to pull the latest issue status for each
            demand.</p>`,
        },
      },
      {
        path: "transactions/iif",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "iif",
          title: "Raise IIF Cart",
          columns: IIF_CART_COLUMNS,
          showApprovalButton: true,
          showSyncButton: true,
          syncButtonLabel: "Sync with ILMS",
          helpHtml: `<p class="mb-0">Items not yet catalogued (INcatted) in ILMS/WLMS. Tick rows and use
            <strong>Send for HOD Approval</strong>, then <strong>Sync with ILMS</strong> to push the
            approved backlog for incatting.</p>`,
        },
      },
      {
        path: "transactions/iif/:id/details",
        loadComponent: () => import("./iif-details/iif-details").then((m) => m.IifDetails),
      },
      {
        path: "transactions/pts-rio-pending",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "pts-rio-pending",
          title: "PTS Raised Survey Pending",
          columns: PTS_RIO_PENDING_CART_COLUMNS,
          showApprovalButton: true,
          showSyncButton: true,
          syncButtonLabel: "Sync With ILMS",
          helpHtml: `<p class="mb-0">PTS/RIO demands already raised where the replaced item's survey is
            still pending. Tick rows and use <strong>Send for HOD Approval</strong>, then
            <strong>Sync With ILMS</strong> once approved.</p>`,
        },
      },

      // Approval / History
      {
        path: "approval",
        loadComponent: () => import("./approval/approval").then((m) => m.Approval),
      },
      {
        path: "history",
        loadComponent: () => import("./history/mo-history").then((m) => m.MoHistory),
      },

      // References ▾ > As is Transaction ▾
      {
        path: "references/transactions/create-cart",
        loadComponent: () => import("./create-cart/create-cart").then((m) => m.CreateCart),
      },
      {
        path: "references/transactions/demand-action",
        loadComponent: () => import("./demand-action/demand-action").then((m) => m.DemandAction),
      },
      {
        path: "references/transactions/issue-authorise",
        loadComponent: () => import("./issue-authorise/issue-authorise").then((m) => m.IssueAuthorise),
      },
      {
        path: "references/transactions/demand-consolidation",
        loadComponent: () =>
          import("./demand-consolidation/demand-consolidation").then((m) => m.DemandConsolidation),
      },
      {
        path: "references/transactions/consumption",
        loadComponent: () => import("./transaction-stub/transaction-stub").then((m) => m.TransactionStub),
        data: { config: CONSUMPTION_CONFIG },
      },
      {
        path: "references/transactions/survey",
        loadComponent: () => import("./survey-reference/survey-reference").then((m) => m.SurveyReference),
      },
      {
        path: "references/transactions/stock-transfer",
        loadComponent: () => import("./transaction-stub/transaction-stub").then((m) => m.TransactionStub),
        data: { config: STOCK_TRANSFER_CONFIG },
      },
      {
        path: "references/transactions/obs-master",
        loadComponent: () => import("./transaction-stub/transaction-stub").then((m) => m.TransactionStub),
        data: { config: OBS_MASTER_CONFIG },
      },

      // References ▾ > Masters
      {
        path: "references/masters",
        loadComponent: () => import("./masters/mo-masters").then((m) => m.MoMasters),
      },
    ],
  },
];
