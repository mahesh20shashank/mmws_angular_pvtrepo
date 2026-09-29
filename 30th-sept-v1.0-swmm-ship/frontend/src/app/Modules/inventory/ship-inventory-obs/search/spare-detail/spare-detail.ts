import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { IconComponent } from "../../../../../shared/components/icon/icon.component";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ObsApiService } from "../../services/obs-api.service";
import { ObsResultListStore } from "../../services/obs-result-list-store";
import { ObsSelectionStore } from "../../services/obs-selection-store";
import { DEFAULT_SPARE_IMAGE, SPARE_CATEGORY_LABEL, Spare } from "../../models/spare.model";

/** The four states this page can be in. It previously had one — the whole
 * card sat inside `@if (spare(); as s)`, so a slow call showed a blank panel and a failed one
 * showed a blank panel for ever, with no toast behind it either, because `feedbackInterceptor`
 * only speaks on mutating methods. A record that is being restructured cannot be handed over with
 * an unhandled failure path, so all four are now explicit. */
type SpareDetailState = "loading" | "ready" | "missing" | "error";

@Component({
  selector: "app-obs-spare-detail",
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  templateUrl: "./spare-detail.html",
  styleUrl: "./spare-detail.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SpareDetail implements OnInit {
  private readonly api = inject(ObsApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly selectionStore = inject(ObsSelectionStore);
  private readonly resultList = inject(ObsResultListStore);
  private readonly notifications = inject(NotificationService);

  readonly categoryLabel = SPARE_CATEGORY_LABEL;
  readonly spare = signal<Spare | null>(null);
  readonly defaultImage = DEFAULT_SPARE_IMAGE;

  /** Drives the loading / ready / missing / error branches in the template.
   * `missing` is kept apart from `error` on purpose: a spare that is gone, or that sits outside
   * the departments this user may see, is an ordinary outcome the operator can act on, while a
   * call that failed is one they should retry. Telling them apart is the difference between "search
   * again" and "try again", and only one of those two is useful advice. */
  readonly state = signal<SpareDetailState>("loading");

  /** Placeholder blocks for the loading branch, one per field the populated
   * screen carries, so the panel keeps its shape while the record is in flight instead of
   * collapsing and then jumping. A plain array because `@for` needs something to track. */
  readonly skeletonBlocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  /** The id currently being shown. A signal, not a plain field, because Previous / Next change
   * it without leaving the route and everything derived from it has to follow. */
  private readonly spareId = signal("");
  /** Set when the browser fails to load `imageUrl` — a path stored against a spare whose file
   * has since gone, or an API that is unreachable. Reset on every navigation, so a working photo
   * on the next spare is not suppressed by the last one's failure. */
  private readonly imageFailed = signal(false);

  /** Always a real, loadable URL. The template used to render the `<img>` only when `imageUrl`
   * was set and had no error handler, so a spare with no photo showed nothing and a spare with a
   * broken one showed the browser's broken-image frame. */
  readonly imageSrc = computed(() => {
    const url = this.spare()?.imageUrl;
    return !url || this.imageFailed() ? DEFAULT_SPARE_IMAGE : url;
  });

  /** Where this spare sits in the result set Item Search last listed. `index` is -1 when this
   * page was opened directly — a deep link, a refresh, or a jump in from the dashboard — and the
   * pager renders disabled rather than disappearing, so the page does not change shape depending
   * on how the user arrived at it. */
  private readonly position = computed(() => {
    const ids = this.resultList.resultIds();
    return { index: ids.indexOf(this.spareId()), total: ids.length, ids };
  });

  readonly hasPrevious = computed(() => this.position().index > 0);
  readonly hasNext = computed(() => {
    const { index, total } = this.position();
    return index >= 0 && index < total - 1;
  });

  readonly positionLabel = computed(() => {
    const { index, total } = this.position();
    return index < 0 ? "—" : `${index + 1} of ${total}`;
  });

  readonly pagerHint = computed(() =>
    this.position().index < 0
      ? "Open a spare from Search Spare to step through your filtered results"
      : "",
  );

  ngOnInit(): void {
    // Subscribed rather than read once off the snapshot. Previous / Next navigate to a sibling
    // of the same route, and Angular reuses this component for that, so a snapshot read would
    // leave the page showing the spare the user had just moved away from.
    this.route.paramMap.subscribe((params) => {
      this.spareId.set(params.get("id") ?? "");
      this.imageFailed.set(false);
      void this.load();
    });
  }

  // The load is now reported, not just performed. `getSpare` is a GET, so
  // nothing in the interceptor chain raises a toast when it fails — without the catch below, a
  // dead API left this page blank and silent. The spare signal is cleared first so a failed step
  // to the next record cannot leave the previous spare's fields on screen under a fresh id.
  private async load(): Promise<void> {
    this.state.set("loading");
    this.spare.set(null);
    try {
      const spare = await firstValueFrom(this.api.getSpare(this.spareId()));
      this.spare.set(spare ?? null);
      this.state.set(spare ? "ready" : "missing");
    } catch {
      this.state.set("error");
    }
  }

  /** Re-runs the same load the route parameter triggers, so a transient
   * failure costs one click rather than a trip back to Search Spare and a re-run of the filters. */
  retry(): void {
    void this.load();
  }

  onImageError(): void {
    this.imageFailed.set(true);
  }

  print(): void {
    window.print();
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search"]);
  }

  edit(): void {
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search", this.spareId(), "edit"]);
  }

  goPrevious(): void {
    this.goTo(-1);
  }

  goNext(): void {
    this.goTo(1);
  }

  private goTo(step: number): void {
    const { index, ids } = this.position();
    const target = ids[index + step];
    if (index < 0 || !target) return;
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search", target]);
  }

  /** Reuses the same single-spare issue flow as the Search Spare grid's own "Issue" row action —
   * `search/:id/issue` isn't a real route, so this used to be a dead end. */
  issue(): void {
    const spare = this.spare();
    if (!spare) return;
    if (spare.quantityAvailable <= 0) {
      this.notifications.error(`${spare.patternNumber} has no quantity held — there is nothing to issue.`);
      return;
    }
    this.selectionStore.setSelection([spare]);
    this.router.navigate(["/afterAuth/inventory/ship-inventory-obs/search/issue-multiple"]);
  }
}
