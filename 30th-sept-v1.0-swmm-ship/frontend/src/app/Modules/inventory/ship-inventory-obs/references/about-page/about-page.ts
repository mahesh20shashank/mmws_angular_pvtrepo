import { ChangeDetectionStrategy, Component } from "@angular/core";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { resolveCmmsApiUrl } from "../../../../../../environments/api-url";

@Component({
  selector: "app-obs-about-page",
  standalone: true,
  imports: [IconComponent],
  templateUrl: "./about-page.html",
  styleUrl: "./about-page.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AboutPage {
  /** Real static file — `backend/media/obs/osms_documentation.pdf` — served by Django's `static()`
   * helper at `MEDIA_URL`. Must be an absolute backend-origin URL: a bare `/media/...` href resolves
   * against the Angular dev server's own origin (which has no such file), not the API host. */
  readonly importRulesPdfUrl = `${resolveCmmsApiUrl()}media/obs/osms_documentation.pdf`;
}
