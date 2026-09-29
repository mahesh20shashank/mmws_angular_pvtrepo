import { Routes } from "@angular/router";
import { MainLayout, OuterLayout, authGuard } from "./Core";
// Developed with Understanding: the other-unit (guest) guard, D30.
import { guestUnitGuard } from "./Core/guards/guest-unit-guard";
export const routes: Routes = [
  // OUTER LAYOUT
  {
    path: "",
    component: OuterLayout,
    children: [
      {
        path: "",
        redirectTo: "landing",
        pathMatch: "full",
      },

      {
        path: "landing",
        //   canActivate: [guestGuard],
        loadComponent: () =>
          import("./Modules/landing/landing.component").then(
            (m) => m.LandingComponent,
          ),
      },
    ],
  },
  {
    path: "afterAuth",
    canActivate: [authGuard],
    // Developed with Understanding: canActivateChild, not a second canActivate entry, because a parent
    // canActivate does not run again when only the child changes - so a sidebar link or a typed URL to
    // any module would slip past it. Child guards also run after authGuard has settled the session.
    canActivateChild: [guestUnitGuard],
    component: MainLayout,
    children: [
      {
        path: "",
        redirectTo: "home",
        pathMatch: "full",
      },
      {
        path: "home",
        children: [
          {
            path: "",
            redirectTo: "overview",
            pathMatch: "full",
          },
          {
            path: "overview",
            loadComponent: () =>
              import("./Modules/home/home/home").then((m) => m.Home),
          },
          {
            path: "daily-orders-history",
            loadComponent: () =>
              import("./Modules/home/daily-orders-history/daily-orders-history").then(
                (m) => m.DailyOrdersHistory,
              ),
          },
          {
            path: "divisional-organisation",
            loadComponent: () =>
              import("./Modules/home/divisional-organisation/divisional-organisation").then(
                (m) => m.DivisionalOrganisation,
              ),
          },
          {
            path: "know-your-regulators",
            loadComponent: () =>
              import("./Modules/home/know-your-regulators/know-your-regulators").then(
                (m) => m.KnowYourRegulators,
              ),
          },
          {
            path: "gallery",
            loadComponent: () =>
              import("./Modules/home/gallery/gallery").then((m) => m.Gallery),
          },
          {
            path: "request-role",
            loadComponent: () =>
              import("./Modules/home/request-role/request-role").then(
                (m) => m.RequestRole,
              ),
          },
          {
            path: "references",
            children: [
              {
                path: "",
                redirectTo: "master",
                pathMatch: "full",
              },
              {
                path: "master",
                loadComponent: () =>
                  import("./Modules/home/department-master/department-master").then(
                    (m) => m.DepartmentMasterComponent,
                  ),
              },
            ],
          },
        ],
      },
      {
        path: "ship",
        children: [
          {
            path: "",
            redirectTo: "overview",
            pathMatch: "full",
          },
          {
            path: ":tab",
            loadComponent: () =>
              import("./Modules/ship-configuration/sfd/sfd-shell.component").then(
                (m) => m.SfdShellComponent,
              ),
          },
        ],
      },

      {
        path: "inbox",
        children: [
          {
            path: "",
            redirectTo: "dashboard",
            pathMatch: "full",
          },
          {
            path: "dashboard",
            loadComponent: () =>
              import("./shared/components/development-in-progress/development-in-progress").then(
                (m) => m.DevelopmentInProgress,
              ),
          },
          {
            path: "overview",
            loadComponent: () =>
              import("./shared/components/development-in-progress/development-in-progress").then(
                (m) => m.DevelopmentInProgress,
              ),
          },
        ],
      },
      {
        path: "outbox",
        children: [
          {
            path: "",
            redirectTo: "dashboard",
            pathMatch: "full",
          },
          {
            path: "dashboard",
            loadComponent: () =>
              import("./shared/components/development-in-progress/development-in-progress").then(
                (m) => m.DevelopmentInProgress,
              ),
          },
          {
            path: "overview",
            loadComponent: () =>
              import("./shared/components/development-in-progress/development-in-progress").then(
                (m) => m.DevelopmentInProgress,
              ),
          },
        ],
      },
      {
        path: "divisional_Organisation",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "Ship_Crew_and_HR",
        loadChildren: () =>
          import("./Modules/ship-crew/ship-crew.routes").then(
            (m) => m.SHIP_CREW_ROUTES,
          ),
      },

      {
        path: "op-maintenance/defect/create-multiple-dart",
        loadChildren: () =>
          import("./Modules/operational-maintenance/actions/multi-dart/multi-dart.routes").then(
            (m) => m.MULTI_DART_ROUTES,
          ),
      },

      {
        path: "op-maintenance",
        children: [
          { path: "", redirectTo: "defect/overview", pathMatch: "full" },

          {
            path: "defect",
            redirectTo: "defect/overview",
            pathMatch: "full",
          },
          {
            path: "routine",
            children: [
              {
                path: "",
                redirectTo: "dashboard",
                pathMatch: "full",
              },
              {
                path: "dashboard",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/ems-dashboard/ems-dashboard").then(
                    (m) => m.EmsDashboard,
                  ),
              },
              {
                path: "dashboard/unique-maintop-routines",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/routines-dashboard").then(
                    (m) => m.RoutinesDashboard,
                  ),
              },
              {
                path: "dashboard/r-h-based-routines",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/r-h-routines/r-h-routines").then(
                    (m) => m.RHRoutines,
                  ),
              },

              {
                path: "dashboard/calendar-based-routing",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/calendar-based-routines/calendar-based-routines").then(
                    (m) => m.CalendarBasedRoutines,
                  ),
              },
              {
                path: "dashboard/equipment-due-for-ABER",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/equipment-due-for-aber/equipment-due-for-aber").then(
                    (m) => m.EquipmentDueForABER,
                  ),
              },
              {
                path: "dashboard/fuss-trigger-list",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/fuss-trigger-list/fuss-trigger-list").then(
                    (m) => m.FUSSTriggerList,
                  ),
              },

              // {
              //   path: "slip-calculator",
              //   loadComponent: () =>
              //     import("./Modules/operational-maintenance/routines-dashboard/slip-calculator/slip-calculator").then(
              //       (m) => m.SlipCalculator,
              //     ),
              // },
              {
                path: "FUSS-triger-list",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/fuss-triger-list/fuss-triger-list").then(
                    (m) => m.FUSSTrigerList,
                  ),
                children: [],
              },

              {
                path: "close-fuss",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/fuss-triger-list/close-fuss/close-fuss").then(
                    (m) => m.CloseFUSS,
                  ),
              },
              {
                path: "fuss-raised-details",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/fuss-triger-list/fuss-raised-details/fuss-raised-details").then(
                    (m) => m.FussRaisedDetails,
                  ),
              },
              {
                path: "fuss-triger-raise-fuss",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/fuss-triger-list/fuss-triger-raise-fuss/fuss-triger-raise-fuss").then(
                    (m) => m.FUSSTrigerRaiseFuss,
                  ),
              },
              {
                path: "search-routines",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/search-routines/search-routines").then(
                    (m) => m.SearchRoutines,
                  ),
              },
              {
                path: "reference",
                redirectTo: "references/masters",
                pathMatch: "full",
              },

              {
                path: "references",
                children: [
                  {
                    path: "",
                    redirectTo: "masters",
                    pathMatch: "full",
                  },

                  {
                    path: "masters",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/references/references").then(
                        (m) => m.References,
                      ),
                  },

                  {
                    path: "exported-files",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/references/exported-files-dl1/exported-files-dl1").then(
                        (m) => m.ExportedFilesDl1,
                      ),
                  },

                  {
                    path: "about-us",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/references/about-us/about-us").then(
                        (m) => m.AboutUs,
                      ),
                  },
                ],
              },

              {
                path: "dl1-generation",
                children: [
                  {
                    path: "",
                    redirectTo: "search-refit",
                    pathMatch: "full",
                  },
                  {
                    path: "search-refit",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/dl1-generation/search-refit-routines/search-refit-routines").then(
                        (m) => m.SearchRefitRoutines,
                      ),
                  },
                  {
                    path: "refit-routine-detail",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/dl1-generation/refit-routine-detail/refit-routine-detail").then(
                        (m) => m.RefitRoutineDetailComponent,
                      ),
                  },
                  {
                    path: "generate",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/dl1-generation/generate-dl1/generate-dl1").then(
                        (m) => m.GenerateDl1,
                      ),
                  },
                ],
              },

              {
                path: "due-routines",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/search-routines/routine-due/routine-due").then(
                    (m) => m.RoutineDue,
                  ),
              },
              {
                path: "r-d-plan-routine",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/search-routines/r-d-plan-routine/r-d-plan-routine").then(
                    (m) => m.RDPlanRoutine,
                  ),
              },
              {
                path: "planned-routines",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/planned-routines/planned-routines").then(
                    (m) => m.PlannedRoutines,
                  ),
              },
              {
                path: "planned-routine-detail",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/planned-routine-detail/planned-routine-detail").then(
                    (m) => m.PlannedRoutineDetailComponent,
                  ),
              },
              {
                path: "close-routine",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/close-routine/close-routine").then(
                    (m) => m.CloseRoutine,
                  ),
              },
              {
                path: "raise-FUSS",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/raise-fuss/raise-fuss").then(
                    (m) => m.RaiseFUSS,
                  ),
              },
              {
                path: "history",
                children: [
                  {
                    path: "",
                    redirectTo: "equipment-routine-history",
                    pathMatch: "full",
                  },
                  {
                    path: "equipment-routine-history",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/history/equipment-routine-history/equipment-routine-history").then(
                        (m) => m.EquipmentRoutineHistoryComponent,
                      ),
                  },
                  {
                    path: "search-equipment-running-history",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/history/search-equipment-running-history/search-equipment-running-history").then(
                        (m) => m.SearchEquipmentRunningHistory,
                      ),
                  },
                  {
                    path: "slip-history",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/history/slip-history/slip-history").then(
                        (m) => m.SlipHistory,
                      ),
                  },
                  {
                    path: "close-routine-history",
                    loadComponent: () =>
                      import("./Modules/operational-maintenance/routines-dashboard/history/close-routine-history/close-routine-history").then(
                        (m) => m.CloseRoutineHistory,
                      ),
                  },
                ],
              },

              {
                path: "reports",
                redirectTo: "reports/weekly",
                pathMatch: "full",
              },
              {
                path: "reports/weekly",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/reports/reports.component").then(
                    (m) => m.ReportsComponent,
                  ),
              },
              {
                path: "reports/fortnightly",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/reports/reports.component").then(
                    (m) => m.ReportsComponent,
                  ),
              },
              {
                path: "reports/monthly",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/reports/reports.component").then(
                    (m) => m.ReportsComponent,
                  ),
              },
              {
                path: "reports/six-monthly",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/reports/reports.component").then(
                    (m) => m.ReportsComponent,
                  ),
              },
              {
                path: "reports/yearly",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/routines-dashboard/reports/reports.component").then(
                    (m) => m.ReportsComponent,
                  ),
              },
              {
                path: "about",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/about/about").then(
                    (m) => m.About,
                  ),
              },
            ],
          },

          {
            path: "op-utilities",
            children: [
              { path: "", redirectTo: "onboard-pol-status", pathMatch: "full" },
              {
                path: "onboard-pol-status",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/op-utilities/onboard-pol-status/onboard-pol-status").then(
                    (m) => m.OnboardPolStatus,
                  ),
              },
              {
                path: "slip-calculator",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/op-utilities/slip-calculator/slip-calculator").then(
                    (m) => m.SlipCalculator,
                  ),
              },
              {
                path: "endurance-calculator",
                loadComponent: () =>
                  import("./Modules/operational-maintenance/op-utilities/endurance-calculator/endurance-calculator").then(
                    (m) => m.EnduranceCalculator,
                  ),
              },
            ],
          },
          {
            path: "about",
            loadComponent: () =>
              import("./Modules/operational-maintenance/about/about").then(
                (m) => m.About,
              ),
          },
          {
            path: "endurance-calculator",
            loadComponent: () =>
              import("./Modules/operational-maintenance/endurance-calculator/endurance-calculator").then(
                (m) => m.EnduranceCalculator,
              ),
          },
          {
            path: "other-utilities",
            loadComponent: () =>
              import("./Modules/operational-maintenance/other-utilities/other-utilities").then(
                (m) => m.OtherUtilities,
              ),
          },

          {
            path: "ra-signal",
            loadComponent: () =>
              import("./Modules/operational-maintenance/ra-signal/ra-signal").then(
                (m) => m.RaSignal,
              ),
          },
          {
            path: "gd-report",
            loadComponent: () =>
              import("./Modules/operational-maintenance/gd-report/gd-report").then(
                (m) => m.GdReport,
              ),
          },
          {
            path: "maintenance-periods",
            loadComponent: () =>
              import("./Modules/operational-maintenance/maintenance-periods/maintenance-periods").then(
                (m) => m.MaintenancePeriods,
              ),
          },
          {
            path: "e-logbooks",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./shared/components/development-in-progress/development-in-progress").then(
                    (m) => m.DevelopmentInProgress,
                  ),
              },
            ],
          },
          {
            path: "create-ra",
            loadComponent: () =>
              import("./Modules/operational-maintenance/create-ra/create-ra").then(
                (m) => m.CreateRA,
              ),
          },
          {
            path: "create-dlii",
            loadComponent: () =>
              import("./Modules/operational-maintenance/create-dliii/create-dliii").then(
                (m) => m.CreateDLIII,
              ),
          },
          {
            path: "close-defects/:id",
            loadComponent: () =>
              import("./Modules/operational-maintenance/defect-closure-details/defect-closure-details").then(
                (m) => m.DefectClosureDetails,
              ),
          },
          // history & history/view-action working for defect
          {
            path: "history",
            loadComponent: () =>
              import("./Modules/operational-maintenance/history/history.component").then(
                (m) => m.HistoryComponent,
              ),
          },
          {
            path: "history/view-action",
            loadComponent: () =>
              import("./Modules/operational-maintenance/history/view-action/view-action.component").then(
                (m) => m.HistoryViewActionComponent,
              ),
          },
          {
            // Same screen as "history" above, reached under the "defect/" prefix so the
            // URL's child segment resolves to "defect" (see NavigationService.getActiveHeaderKey)
            // â€” required for the Defect header's custom tab order (headerTabOrders.defect in
            // navigation.config.ts) to apply instead of falling back to the default tab order.
            path: "defect/history",
            loadComponent: () =>
              import("./Modules/operational-maintenance/history/history.component").then(
                (m) => m.HistoryComponent,
              ),
          },
          {
            path: "defect/history/view-action",
            loadComponent: () =>
              import("./Modules/operational-maintenance/history/view-action/view-action.component").then(
                (m) => m.HistoryViewActionComponent,
              ),
          },
          {
            // Reached from the Defect / DART List's "RA Draft" button (checked DARTs are
            // passed via router state — see DefectView.goToRaDraft / RaiseRa.ngOnInit).
            path: "defect/actions/raise-ra",
            loadComponent: () =>
              import("./Modules/operational-maintenance/new-defect/raise-ra/raise-ra").then(
                (m) => m.RaiseRa,
              ),
          },
          {
            path: ":child/:tab",
            loadComponent: () =>
              import("./Modules/operational-maintenance/operational-maintenance").then(
                (m) => m.OperationalMaintenance,
              ),
          },
        ],
      },

      {
        path: "inventory",
        children: [
          { path: "", redirectTo: "ship-inventory-obs", pathMatch: "full" },
          {
            path: "ship-inventory-obs",
            loadChildren: () =>
              import("./Modules/inventory/ship-inventory-obs/ship-inventory-obs.routes").then(
                (m) => m.SHIP_INVENTORY_OBS_ROUTES,
              ),
          },
          {
            path: "shore-inventory-mo",
            loadChildren: () =>
              import("./Modules/inventory/shore-inventory-mo/shore-inventory-mo.routes").then(
                (m) => m.SHORE_INVENTORY_MO_ROUTES,
              ),
          },
          {
            path: "shore-inventory-wed",
            loadChildren: () =>
              import("./Modules/inventory/shore-inventory-wed/shore-inventory-wed.routes").then(
                (m) => m.SHORE_INVENTORY_WED_ROUTES,
              ),
          },
        ],
      },
      {
        path: "ship-returns",
        loadChildren: () =>
          import("./Modules/ship-returns/ship-returns.routes").then(
            (m) => m.SHIP_RETURNS_ROUTES,
          ),
      },

      {
        path: "other-utilities",
        loadChildren: () =>
          import("./Modules/other-utilities/other-utilities.routes").then(
            (m) => m.OTHER_UTILITIES_ROUTES,
          ),
      },
      {
        path: "activity",
        children: [
          { path: "", redirectTo: "calendar", pathMatch: "full" },
          {
            path: "calendar",
            data: { initialView: "Month" },
            loadComponent: () =>
              import("./Modules/operational-coordination-planner/pages/planner/planner.component").then(
                (m) => m.OperationalCoordinationPlannerComponent,
              ),
          },
        ],
      },
      {
        path: "technical-dashboard",
        children: [
          { path: "", redirectTo: "dashboard", pathMatch: "full" },
          {
            path: "dashboard",
            children: [
              {
                path: "",
                loadComponent: () =>
                  import("./Modules/operational-coordination-planner/pages/dashboard/dashboard.component").then(
                    (m) => m.OcPlannerDashboardComponent,
                  ),
              },
              {
                path: "equipment-status",
                loadComponent: () =>
                  import("./Modules/operational-coordination-planner/pages/equipment-status/equipment-status.component").then(
                    (m) => m.EquipmentStatusComponent,
                  ),
              },
            ],
          },
        ],
      },
      {
        path: "dss",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "Reports",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "KPIs",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "kms",
        children: [
          { path: "", redirectTo: "dashboard/overview", pathMatch: "full" },
          {
            path: "dashboard",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/dashboard/kms-dashboard").then(
                    (m) => m.KmsDashboard,
                  ),
              },
            ],
          },
          {
            path: "technical",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/technical/kms-technical").then(
                    (m) => m.KmsTechnical,
                  ),
              },
            ],
          },
          {
            path: "certificates",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/certificates/kms-certificates").then(
                    (m) => m.KmsCertificates,
                  ),
              },
            ],
          },
          {
            path: "in-mail",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/in-mail/kms-in-mail").then(
                    (m) => m.KmsInMail,
                  ),
              },
            ],
          },
          {
            path: "out-mail",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/out-mail/kms-out-mail").then(
                    (m) => m.KmsOutMail,
                  ),
              },
            ],
          },
          {
            path: "sharepoint",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/sharepoint/kms-sharepoint").then(
                    (m) => m.KmsSharepoint,
                  ),
              },
            ],
          },
          {
            path: "category-master",
            children: [
              { path: "", redirectTo: "overview", pathMatch: "full" },
              {
                path: "overview",
                loadComponent: () =>
                  import("./Modules/kms/category-master/kms-category-master").then(
                    (m) => m.KmsCategoryMaster,
                  ),
              },
            ],
          },
        ],
      },
      {
        path: "Audit_and_Logs",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "Help",
        children: [{ path: "", redirectTo: "overview", pathMatch: "full" }],
      },
      {
        path: "ticket-management",
        children: [
          { path: "", redirectTo: "dashboard", pathMatch: "full" },
          {
            path: "dashboard",
            loadComponent: () =>
              import("./Modules/ticket-management/ticket-management-dashboard.component").then(
                (m) => m.TicketManagementDashboardComponent,
              ),
          },
          {
            path: "my-tickets",
            loadComponent: () =>
              import("./Modules/ticket-management/my-ticket/my-ticket.component").then(
                (m) => m.MyTicketComponent,
              ),
          },
        ],
      },
      {
        path: "Administration",
        loadChildren: () =>
          import("./Modules/administration/administration.routes").then(
            (m) => m.ADMINISTRATION_ROUTES,
          ),
      },
      {
        path: "refit_dashboard",
        loadChildren: () =>
          import("./Modules/dl-monitoring/dl-monitoring.routes").then(
            (m) => m.DL_MONITORING_ROUTES,
          ),
      },
      {
        path: "profile",
        loadComponent: () =>
          import("./Modules/profile/profile").then((m) => m.Profile),
      },
      // Developed with Understanding: Guest Home - the only afterAuth page an other-unit login reaches (D30).
      {
        path: "guest",
        loadComponent: () =>
          import("./Modules/guest/guest-home/guest-home.component").then(
            (m) => m.GuestHomeComponent,
          ),
      },
    ],
  },
  {
    path: "other-utilities/:sub/:page",
    redirectTo: "afterAuth/other-utilities/:sub/:page",
  },
  {
    path: "other-utilities/:sub",
    redirectTo: "afterAuth/other-utilities/:sub",
  },
  {
    path: "other-utilities",
    redirectTo: "afterAuth/other-utilities",
  },
  {
    path: "**",
    loadComponent: () =>
      import("./shared/components/under-construction/under-construction").then(
        (m) => m.UnderConstruction,
      ),
  },
];
