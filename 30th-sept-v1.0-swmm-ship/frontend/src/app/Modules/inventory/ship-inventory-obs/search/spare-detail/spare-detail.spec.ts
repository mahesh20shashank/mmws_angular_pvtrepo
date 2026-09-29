import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucidePrinter,
  provideLucideIcons,
} from "@lucide/angular";
import { BehaviorSubject, of } from "rxjs";
import { NotificationService } from "../../../../../Core/services/notification/notification.service";
import { ObsApiService } from "../../services/obs-api.service";
import { ObsResultListStore } from "../../services/obs-result-list-store";
import { Spare } from "../../models/spare.model";
import { SpareDetail } from "./spare-detail";

/** The two things this page was reported for.
 *
 * A spare with no photograph rendered NOTHING - the `<img>` was inside an `@if (s.imageUrl)` and
 * there was no fallback and no error handler - so what the operator saw was the alt text beside a
 * broken-image frame. And the page was a dead end: the grid's filtered result set lived in a
 * component-local signal that the navigation to this page destroyed, so there was no way to step
 * from one matched spare to the next without going back and finding the row again.
 */
describe("SpareDetail", () => {
  const DEFAULT_IMAGE = "assets/images/default-spare.png";

  function spare(id: string, imageUrl?: string): Spare {
    return {
      id,
      patternNumber: `PAT-${id}`,
      description: "OIL SEAL KIT",
      quantityAvailable: 3,
      imageUrl,
    } as Spare;
  }

  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;
  let navigated: unknown[][];
  let spares: Record<string, Spare>;

  // `load()` awaits `firstValueFrom`, so the spare signal is set on a microtask rather than
  // during `ngOnInit` — every case has to let that settle before it looks at the component or
  // the rendered template.
  async function create(id: string, ids: string[] = []) {
    params = new BehaviorSubject(convertToParamMap({ id }));
    navigated = [];

    TestBed.configureTestingModule({
      imports: [SpareDetail],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params } },
        {
          provide: Router,
          useValue: {
            navigate: (commands: unknown[]) => {
              navigated.push(commands);
              return Promise.resolve(true);
            },
          },
        },
        {
          provide: ObsApiService,
          useValue: { getSpare: (id: string) => of(spares[id]) },
        },
        // Stubbed so the component's own injection does not pull the HTTP stack in behind it —
        // none of these cases raises a toast.
        { provide: NotificationService, useValue: { error: () => undefined } },
        // The three icons this template names. `provideLucideIcons` in `app.config.ts` is the
        // application's single registry and TestBed does not load it, so an unregistered name
        // throws while rendering rather than failing quietly.
        provideLucideIcons(LucideChevronLeft, LucideChevronRight, LucidePrinter),
      ],
    });

    TestBed.inject(ObsResultListStore).setResults(ids);
    const fixture = TestBed.createComponent(SpareDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    TestBed.resetTestingModule();
    spares = {
      "1": spare("1", "http://api.test/media/obs/E/SPARES/PUMP/abc.jpg"),
      "2": spare("2"),
      "3": spare("3"),
    };
  });

  it("shows the spare's own photograph when it has one", async () => {
    const component = (await create("1", ["1", "2", "3"])).componentInstance;

    expect(component.imageSrc()).toBe("http://api.test/media/obs/E/SPARES/PUMP/abc.jpg");
  });

  it("shows the placeholder when the spare has no photograph", async () => {
    const component = (await create("2", ["1", "2", "3"])).componentInstance;

    expect(component.imageSrc()).toBe(DEFAULT_IMAGE);
  });

  it("falls back to the placeholder when the photograph fails to load", async () => {
    // The stored path is a real column and the file behind it can be moved or deleted, so a
    // URL that 404s is an ordinary state and not an exceptional one.
    const component = (await create("1", ["1"])).componentInstance;
    component.onImageError();

    expect(component.imageSrc()).toBe(DEFAULT_IMAGE);
  });

  it("renders one image element whether or not there is a photograph", async () => {
    const fixture = await create("2", ["2"]);
    const images = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll("img.obs-detail-image"),
    ];

    expect(images).toHaveLength(1);
  });

  it("steps forward and back through the filtered results", async () => {
    const component = (await create("2", ["1", "2", "3"])).componentInstance;

    expect(component.positionLabel()).toBe("2 of 3");
    expect(component.hasPrevious()).toBe(true);
    expect(component.hasNext()).toBe(true);

    component.goNext();
    expect(navigated.at(-1)).toEqual(["/afterAuth/inventory/ship-inventory-obs/search", "3"]);

    component.goPrevious();
    expect(navigated.at(-1)).toEqual(["/afterAuth/inventory/ship-inventory-obs/search", "1"]);
  });

  it("disables the ends of the list rather than wrapping round it", async () => {
    const first = (await create("1", ["1", "2", "3"])).componentInstance;
    expect(first.hasPrevious()).toBe(false);
    expect(first.hasNext()).toBe(true);

    TestBed.resetTestingModule();
    const last = (await create("3", ["1", "2", "3"])).componentInstance;
    expect(last.hasPrevious()).toBe(true);
    expect(last.hasNext()).toBe(false);
  });

  it("keeps the buttons rendered but disabled when the page was opened directly", async () => {
    // A deep link, a refresh, or a jump in from the dashboard. The pager must not change the
    // page's shape depending on how the operator arrived at it.
    const fixture = await create("1", []);
    const component = fixture.componentInstance;

    expect(component.hasPrevious()).toBe(false);
    expect(component.hasNext()).toBe(false);
    expect(component.positionLabel()).toBe("—");
    expect(component.pagerHint()).toContain("Search Spare");

    const buttons = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>(
        ".obs-detail-pager button",
      ),
    ];
    expect(buttons).toHaveLength(2);
    expect(buttons[0]?.disabled).toBe(true);
    expect(buttons[1]?.disabled).toBe(true);
  });

  it("reloads when the route parameter changes under it", async () => {
    // Previous / Next navigate to a sibling of the same route and Angular reuses the component,
    // so reading the id once off the snapshot left the page showing the spare just moved away
    // from.
    const fixture = await create("1", ["1", "2", "3"]);

    params.next(convertToParamMap({ id: "2" }));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.componentInstance.spare()?.id).toBe("2");
    expect(fixture.componentInstance.imageSrc()).toBe(DEFAULT_IMAGE);
  });
});
