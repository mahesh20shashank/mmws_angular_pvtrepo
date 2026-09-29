import { Routes } from "@angular/router";
import { WedShell } from "./shell/wed-shell/wed-shell";
import {
  DEMAND_CART_COLUMNS,
  IIF_CART_COLUMNS,
  PTS_CART_COLUMNS,
  PTS_RIO_PENDING_CART_COLUMNS,
  RECEIVE_CART_COLUMNS,
  SURVEY_CART_COLUMNS,
} from "./cart-list/cart-columns";

export const SHORE_INVENTORY_WED_ROUTES: Routes = [
  {
    path: "",
    component: WedShell,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () => import("./dashboard/wed-dashboard/wed-dashboard").then((m) => m.WedDashboard),
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
          showSyncButton: true,
          syncButtonLabel: "Get Survey Data",
          detailsAction: "survey",
        },
      },
      {
        path: "transactions/survey/:id/details",
        loadComponent: () => import("./survey-details/survey-details").then((m) => m.SurveyDetails),
      },
      {
        path: "transactions/pts",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "pts",
          title: "Results - To Be PTS",
          columns: PTS_CART_COLUMNS,
          showApprovalButton: true,
          detailsAction: "pts",
        },
      },
      {
        path: "transactions/pts/:id/details",
        loadComponent: () => import("./pts-details/pts-details").then((m) => m.PtsDetails),
      },
      {
        path: "transactions/demand",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "demand",
          title: "Results - To Be Demand",
          columns: DEMAND_CART_COLUMNS,
          showApprovalButton: true,
          detailsAction: "demand",
        },
      },
      {
        path: "transactions/demand/:id/details",
        loadComponent: () => import("./demand-details/demand-details").then((m) => m.DemandDetails),
      },
      {
        path: "transactions/receive",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "receive",
          title: "Results - To Be Receipt",
          columns: RECEIVE_CART_COLUMNS,
          showCheckboxes: false,
          showApprovalButton: false,
          showSyncButton: true,
          syncButtonLabel: "Get PTS & Demand Data",
          detailsAction: "receive",
        },
      },
      {
        path: "transactions/iif",
        loadComponent: () => import("./cart-list/cart-list").then((m) => m.CartList),
        data: {
          kind: "iif",
          title: "IIF Details",
          columns: IIF_CART_COLUMNS,
          showApprovalButton: true,
          showSyncButton: true,
          syncButtonLabel: "Sync With WLMS",
          showRaiseButton: true,
          raiseButtonLabel: "Raise IIF",
          detailsAction: "iif",
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
          title: "Results - To Be PTS Raised - Survey Pending",
          columns: PTS_RIO_PENDING_CART_COLUMNS,
          showApprovalButton: true,
          showSyncButton: true,
          syncButtonLabel: "Sync With WLMS",
        },
      },

      {
        path: "signal-demand",
        loadComponent: () => import("./signal-demand/signal-demand").then((m) => m.SignalDemand),
      },

      // Approval / History
      {
        path: "approval",
        loadComponent: () => import("./approval/approval").then((m) => m.Approval),
      },
      {
        path: "history",
        loadComponent: () => import("./history/wed-history").then((m) => m.WedHistory),
      },

      // References ▾ > Masters
      {
        path: "references/masters",
        loadComponent: () => import("./masters/wed-masters").then((m) => m.WedMasters),
      },
    ],
  },
];
