import { ChangeDetectionStrategy, Component } from "@angular/core";

import { ActionForms } from "../../operational-maintenance/action-forms/action-forms";

/**
 * Operational Maintenance — Defect tab. Thin wrapper around the existing
 * `app-action-forms` ("Initiate Defect") component, which already switches
 * between Defect / Guarantee Defect / A's & A's-ABER via its own radio tabs.
 */
@Component({
  selector: "app-opm-create-defect",
  standalone: true,
  imports: [ActionForms],
  templateUrl: "./opm-create-defect.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmCreateDefectComponent {}
