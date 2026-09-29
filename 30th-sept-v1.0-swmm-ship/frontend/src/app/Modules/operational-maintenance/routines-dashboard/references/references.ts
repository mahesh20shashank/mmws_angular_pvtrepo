import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component} from "@angular/core";
import { ImportData } from "./import-data/import-data";
import { OneTimeRoutine } from "./one-time-routine/one-time-routine";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";

const HELP_HTML = `
  <ul class="mb-0">
    <li><strong>Import Data</strong> - synchronises equipment nomenclature and routines from CMMS, showing live progress and a process log.</li>
    <li><strong>One time Routine Initialization</strong> - click a row to open a routine and set its starting point (last completion, running hours, etc.) when it has not yet been initialized in the app.</li>
  </ul>
`;

@Component({
  selector: "app-action-forms",
  imports: [ImportData, OneTimeRoutine, HelpGuidance, ButtonComponent],
  templateUrl: './references.html',
  styleUrl: './references.css',
})
export class References {
  readonly helpHtml = HELP_HTML;

  activeTab: "import-data" | "one-time-routine" = "one-time-routine";






}
