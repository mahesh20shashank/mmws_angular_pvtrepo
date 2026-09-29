import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { toSignal } from "@angular/core/rxjs-interop";

import { OpmOverviewComponent } from "./overview/opm-overview.component";
import { OpmConfigurationComponent } from "./configuration/opm-configuration.component";
import { OpmReportsComponent } from "./reports/opm-reports.component";
import { OpmInsightsComponent } from "./insights/opm-insights.component";
import { OpmDefectComponent } from "./defect/opm-defect.component";
import { OpmCreateDefectComponent } from "./defect/opm-create-defect.component";
import { OpenDefects } from "../operational-maintenance/open-defects/open-defects";
import { DevelopmentInProgress } from "../../shared/components/development-in-progress/development-in-progress";
import { MastersComponent } from "../operational-maintenance/references/masters/masters.component";
import { ExportedFilesComponent } from "../operational-maintenance/references/exported-files/exported-files.component";
import { DefectView } from "./new-defect/defect-view/defect-view";
/** Header-tab route segment (`op-maintenance/:child/:tab`) → internal screen id. */
const TAB_ROUTE_MAP: Record<string, string> = {
  overview: "overview",
  configuration: "configuration",
  actions: "actions",
  reports: "reports",
  insights: "insights",
  defect: "defect",
  "open-darts": "open-darts",
  "create-multiple-dart": "create-multiple-dart",
  "references-masters": "references-masters",
  "references-exported-files": "references-exported-files",
};

/**
 * Operational Maintenance shell. Reads the `:tab` route segment (set by the
 * shared header tabs) and `@switch`-renders the matching tab screen. There is
 * no in-content tab bar — navigation is driven entirely by the header/route,
 * mirroring the SFD `sfd-shell` pattern.
 */
@Component({
  selector: "app-opm-shell",
  standalone: true,
  imports: [
    OpmOverviewComponent,
    OpmConfigurationComponent,
    OpmReportsComponent,
    OpmInsightsComponent,
    OpmDefectComponent,
    OpmCreateDefectComponent,
    OpenDefects,
    DevelopmentInProgress,
    MastersComponent,
    ExportedFilesComponent,
    // DefectView
  ],
  templateUrl: "./opm-shell.component.html",
  styleUrls: ["./opm-shell.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmShellComponent {
  private readonly route = inject(ActivatedRoute);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** Active screen id resolved from the `:tab` route segment. */
  readonly activeTab = computed(() => TAB_ROUTE_MAP[this.params().get("tab") ?? "overview"] ?? "overview");
}
