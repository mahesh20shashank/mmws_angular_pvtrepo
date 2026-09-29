import { ChangeDetectionStrategy, Component } from "@angular/core";

import { OpenDefects } from "../../operational-maintenance/open-defects/open-defects";

/**
 * Operational Maintenance — Open DARTs tab. Thin wrapper around the existing
 * `app-open-defects` list (Open DARTs register + DL-III view) so it renders
 * inside the new `opm-shell` tab switcher instead of the legacy
 * `op-maintenance` route tree.
 */
@Component({
  selector: "app-opm-open-darts",
  standalone: true,
  imports: [OpenDefects],
  templateUrl: "./opm-defect.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmDefectComponent {}
