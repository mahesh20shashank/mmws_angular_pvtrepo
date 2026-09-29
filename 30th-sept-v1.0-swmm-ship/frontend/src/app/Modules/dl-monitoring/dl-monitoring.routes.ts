import { Routes } from "@angular/router";
import { DlShellComponent } from "./shell/dl-shell.component";

export const DL_MONITORING_ROUTES: Routes = [
  {
    path: "",
    component: DlShellComponent,
    children: [
      {
        path: "",
        redirectTo: "overview",
        pathMatch: "full",
      },
      {
        path: "overview",
        loadComponent: () =>
          import("./dashboard/dashboard.component").then(
            (m) => m.DashboardComponent
          ),
      },
      {
        path: "dl-type",
        loadComponent: () =>
          import("./tracking/tracking.component").then(
            (m) => m.TrackingComponent
          ),
      },
      {
        path: "tracking",
        redirectTo: "tracking/ALL",
        pathMatch: "full",
      },
      {
        path: "tracking/:type",
        loadComponent: () =>
          import("./tracking/tracking.component").then(
            (m) => m.TrackingComponent
          ),
      },
      {
        path: "transaction",
        redirectTo: "tracking/ALL",
        pathMatch: "full",
      },
      {
        path: "import",
        loadComponent: () =>
          import("./tracking/tracking.component").then(
            (m) => m.TrackingComponent
          ),
      },
      {
        path: "master",
        loadComponent: () =>
          import("./import/import.component").then(
            (m) => m.ImportComponent
          ),
      },
      {
        path: "references",
        loadComponent: () =>
          import("./import/import.component").then(
            (m) => m.ImportComponent
          ),
      },
      {
        path: "history",
        loadComponent: () =>
          import("./history/history.component").then(
            (m) => m.HistoryComponent
          ),
      },
    ],
  },
];
