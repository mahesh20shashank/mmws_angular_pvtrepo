import { Routes } from "@angular/router";

export const OTHER_UTILITIES_ROUTES: Routes = [
  {
    path: "",
    redirectTo: "hotwork",
    pathMatch: "full",
  },
  {
    path: "hotwork",
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () =>
          import("./hotwork/dashboard/hotwork-dashboard.component").then(
            (m) => m.HotworkDashboardComponent,
          ),
      },
      {
        path: "manage-hotwork",
        loadComponent: () =>
          import("./hotwork/manage-hotwork/manage-hotwork.component").then(
            (m) => m.ManageHotworkComponent,
          ),
      },
      {
        path: "history",
        loadComponent: () =>
          import("./hotwork/history/hotwork-history.component").then(
            (m) => m.HotworkHistoryComponent,
          ),
      },


      {
        path: "raise-requisition",
        loadComponent: () =>
          import("./hotwork/raise-requisition/raise-requisition.component").then(
            (m) => m.RaiseHotworkRequisitionComponent,
          ),
      },
      {
        path: "create-requisition",
        loadComponent: () =>
          import("./hotwork/raise-requisition/raise-requisition.component").then(
            (m) => m.RaiseHotworkRequisitionComponent,
          ),
      },
      {
        path: "raise-hotwork-requisition",
        loadComponent: () =>
          import("./hotwork/raise-requisition/raise-requisition.component").then(
            (m) => m.RaiseHotworkRequisitionComponent,
          ),
      },
      {
        path: "inbox",
        loadComponent: () =>
          import("./hotwork/action/inbox/inbox").then(
            (m) => m.InboxComponent,
          ),
      },
      {
        path: "outbox",
        loadComponent: () =>
          import("./hotwork/action/outbox/outbox").then(
            (m) => m.OutboxComponent,
          ),
      },
      {
        path: "initiate",
        loadComponent: () =>
          import("./hotwork/raise-requisition/raise-requisition.component").then(
            (m) => m.RaiseHotworkRequisitionComponent,
          ),
      },
      {
        path: "inspect",
        loadComponent: () =>
          import("./hotwork/requisitions-approval-pending/requisitions-approval-pending.component").then(
            (m) => m.RequisitionsApprovalPendingComponent,
          ),
      },
      {
        path: "requisitions-approval-pending",
        loadComponent: () =>
          import("./hotwork/requisitions-approval-pending/requisitions-approval-pending.component").then(
            (m) => m.RequisitionsApprovalPendingComponent,
          ),
      },
      {
        path: "requisitions_approval_pending",
        loadComponent: () =>
          import("./hotwork/requisitions-approval-pending/requisitions-approval-pending.component").then(
            (m) => m.RequisitionsApprovalPendingComponent,
          ),
      },
      {
        path: "monitor-approved-requisitions",
        loadComponent: () =>
          import("./hotwork/monitor-approved-requisitions/monitor-approved-requisitions.component").then(
            (m) => m.MonitorApprovedRequisitionsComponent,
          ),
      },
      {
        path: "monitor_approved_requisitions",
        loadComponent: () =>
          import("./hotwork/monitor-approved-requisitions/monitor-approved-requisitions.component").then(
            (m) => m.MonitorApprovedRequisitionsComponent,
          ),
      },
    ],
  },
  {
    path: "tag-in-tag-out",
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-in-tag-out.component").then(
            (m) => m.TagInTagOutComponent,
          ),
      },
      {
        path: "tag-out",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-out/tag-out.component").then(
            (m) => m.TagOutComponent,
          ),
      },
      {
        path: "create-tagout",
        loadComponent: () =>
          import("./tag-in-tag-out/create-tagout/create-tagout.component").then(
            (m) => m.CreateTagoutComponent,
          ),
      },
      {
        path: "addtagout",
        loadComponent: () =>
          import("./tag-in-tag-out/create-tagout/create-tagout.component").then(
            (m) => m.CreateTagoutComponent,
          ),
      },
      {
        path: "tag-in",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-in/tag-in.component").then(
            (m) => m.TagInComponent,
          ),
      },
      {
        path: "create-tagin",
        loadComponent: () =>
          import("./tag-in-tag-out/create-tagin/create-tagin.component").then(
            (m) => m.CreateTaginComponent,
          ),
      },
      {
        path: "addtagin",
        loadComponent: () =>
          import("./tag-in-tag-out/create-tagin/create-tagin.component").then(
            (m) => m.CreateTaginComponent,
          ),
      },
      {
        path: "approval",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-in-tag-out.component").then(
            (m) => m.TagInTagOutComponent,
          ),
      },
      {
        path: "tag-out-approval",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-out/tag-out.component").then(
            (m) => m.TagOutComponent,
          ),
      },
      {
        path: "tag-in-approval",
        loadComponent: () =>
          import("./tag-in-tag-out/tag-in/tag-in.component").then(
            (m) => m.TagInComponent,
          ),
      },
      {
        path: "history",
        loadComponent: () =>
          import("./tag-in-tag-out/history/tag-history.component").then(
            (m) => m.TagHistoryComponent,
          ),
      },
    ],
  },
];
