import { Routes } from "@angular/router";
import { CrewShell } from "./shell/crew-shell/crew-shell";

export const SHIP_CREW_ROUTES: Routes = [
  {
    path: "",
    component: CrewShell,
    children: [
      { path: "", redirectTo: "dashboard", pathMatch: "full" },
      {
        path: "dashboard",
        loadComponent: () => import("./dashboard/crew-dashboard/crew-dashboard").then((m) => m.CrewDashboard),
      },
      {
        path: "watch-station-bill",
        loadComponent: () => import("./watch-station-bill/wsb-home/wsb-home").then((m) => m.WsbHome),
      },
      {
        path: "personnel-status",
        loadComponent: () => import("./personnel-status/personnel-status").then((m) => m.PersonnelStatus),
      },
      {
        path: "leave-ty-duty",
        loadComponent: () => import("./crew-utilities/leave-ty-duty/leave-ty-duty").then((m) => m.LeaveTyDuty),
      },
      {
        path: "leave-forecast",
        loadComponent: () => import("./crew-utilities/leave-forecast/leave-forecast").then((m) => m.LeaveForecast),
      },
    ],
  },
];
