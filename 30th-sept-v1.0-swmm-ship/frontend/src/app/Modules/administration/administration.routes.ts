import { Routes } from "@angular/router";

export const ADMINISTRATION_ROUTES: Routes = [
  { path: "", redirectTo: "nav-visibility", pathMatch: "full" },
  {
    path: "overview",
    loadComponent: () =>
      import("./administration-overview").then((m) => m.AdministrationOverview),
  },
  {
    path: "nav-visibility",
    loadComponent: () =>
      import("./nav-visibility/nav-visibility.component").then((m) => m.NavVisibilityComponent),
  },
  {
    path: "user-list",
    loadComponent: () =>
      import("./user-list/user-list.component").then((m) => m.UserListComponent),
  },
  {
    path: "users",
    loadComponent: () =>
      import("./user-list/user-list.component").then((m) => m.UserListComponent),
  },
  {
    path: "admin-dashboard",
    loadComponent: () =>
      import("./admin-dashboard/admin-dashboard.component").then(
        (m) => m.AdminDashboardComponent
      ),
  },
  {
    path: "admin_dashboard",
    loadComponent: () =>
      import("./admin-dashboard/admin-dashboard.component").then(
        (m) => m.AdminDashboardComponent
      ),
  },
  {
    path: "sync-hrcdf",
    loadComponent: () =>
      import("./sync-hrcdf/sync-hrcdf.component").then((m) => m.SyncHrcdfComponent),
  },
];
