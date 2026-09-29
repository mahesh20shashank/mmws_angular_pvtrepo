import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router } from "@angular/router";
import {
  LucideChevronDown,
  LucideChevronLast,
  LucideChevronLeft,
  LucideChevronRight,
  LucideFileText,
  LucideInfo,
  LucidePrinter,
  LucideSearch,
  LucideSheet,
  LucideSquarePen,
  provideLucideIcons,
} from "@lucide/angular";
import { NEVER, of } from "rxjs";
import { AllCommunityModule, ColDef, ModuleRegistry } from "ag-grid-community";
import { ObsApiService } from "../../services/obs-api.service";
import { Spare } from "../../models/spare.model";
import { SpareStatusList, SpareStatusKind } from "./spare-status-list";

/** Lucide resolves icons by NAME through a global registry, and an
 * unregistered name throws at render rather than failing to compile. The template tree
 * under test (data grid footer, toolbar search, export toolbar, help guidance) reaches for
 * these, so they are registered here exactly as `app.config.ts` does for the running app. */
/** ag-grid 35 refuses to render until its modules are registered.
 * `app.config.ts` does this once at bootstrap, which TestBed never runs; the registry is
 * static, so registering here covers every case in this file. */
ModuleRegistry.registerModules([AllCommunityModule]);

const ICON_PROVIDERS = provideLucideIcons(
  LucideChevronDown,
  LucideChevronLast,
  LucideChevronLeft,
  LucideChevronRight,
  LucideFileText,
  LucideInfo,
  LucidePrinter,
  LucideSearch,
  LucideSheet,
  LucideSquarePen,
);

/** The D787J Deficiency screen listed every spare held on the D787J
 * scale, including rows held at their full authorised quantity, because the endpoint
 * filtered on the authority alone. The rule now lives server-side in
 * `SparesQuerySet.d787j_deficiencies()`; what this component owes is the shortfall column,
 * its default sort, and a result set that reads as a sentence when it is legitimately empty.
 *
 * The "Spares < 50%" route shares this component, so half of these cases exist to prove it
 * is unchanged.
 */
describe("SpareStatusList", () => {
  function spare(patternNumber: string, authorised: number, held: number): Spare {
    return {
      id: patternNumber,
      patternNumber,
      description: `DESC ${patternNumber}`,
      quantityAuthorised: authorised,
      quantityAvailable: held,
      deficiencyQuantity: authorised - held,
      equipmentClass: "COMPRESSOR",
      spareClass: "MECHANICAL",
      category: "PERMANENT",
      critical: false,
      authority: "D787J",
    } as Spare;
  }

  // `load()` awaits `firstValueFrom`, so rows land on a microtask rather than during
  // `ngOnInit` — every case has to let that settle before asserting.
  async function create(kind: SpareStatusKind, rows: Spare[] = []) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [SpareStatusList],
      providers: [
        ICON_PROVIDERS,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { data: { kind, title: "D787J Deficiency" } } },
        },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        {
          provide: ObsApiService,
          useValue: {
            getD787jDeficiency: () => of(rows),
            getSparesLessThan50Percent: () => of(rows),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(SpareStatusList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function headers(columns: ColDef[]): (string | undefined)[] {
    return columns.map((c) => c.headerName);
  }

  describe("the D787J Deficiency route", () => {
    it("shows Qty Deficient immediately after Qty Held", async () => {
      const fixture = await create("d787j-deficiency", [spare("PN-1", 6, 4)]);
      const names = headers(fixture.componentInstance.columnDefs());

      expect(names).toContain("Qty Deficient");
      expect(names.indexOf("Qty Deficient")).toBe(names.indexOf("Qty Held") + 1);
    });

    it("sorts by Qty Deficient descending by default", async () => {
      const fixture = await create("d787j-deficiency", [spare("PN-1", 6, 4)]);
      const column = fixture.componentInstance
        .columnDefs()
        .find((c) => c.field === "deficiencyQuantity");

      expect(column?.sort).toBe("desc");
      // Bracketed: `sortIndex` reaches ColDef through an index signature, and the project
      // compiles with `noPropertyAccessFromIndexSignature`.
      expect(column?.["sortIndex"]).toBe(0);
    });

    it("carries Qty Deficient into the exports, in the same position", async () => {
      const fixture = await create("d787j-deficiency", [spare("PN-1", 6, 4)]);
      const names = fixture.componentInstance.printColumns().map((c) => c.header);

      expect(names.indexOf("Qty Deficient")).toBe(names.indexOf("Qty Held") + 1);
    });

    it("states that nothing is short when no rows come back", async () => {
      const fixture = await create("d787j-deficiency", []);
      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

      expect(fixture.componentInstance.loading()).toBe(false);
      expect(text).toContain("No deficiencies against D787J");
      expect((fixture.nativeElement as HTMLElement).querySelector("app-data-grid")).toBeNull();
    });

    it("shows the grid, not the empty state, when rows come back", async () => {
      const fixture = await create("d787j-deficiency", [spare("PN-1", 6, 4)]);
      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

      expect(text).not.toContain("No deficiencies against D787J");
      expect((fixture.nativeElement as HTMLElement).querySelector("app-data-grid")).not.toBeNull();
    });

    it("does not claim there are no deficiencies before the first response lands", async () => {
      // The empty state is gated on `loading` precisely so it cannot render in this window.
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [SpareStatusList],
        providers: [
          ICON_PROVIDERS,
          {
            provide: ActivatedRoute,
            useValue: { snapshot: { data: { kind: "d787j-deficiency", title: "D787J Deficiency" } } },
          },
          { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
          {
            provide: ObsApiService,
            // NEVER emits and never completes, so the component stays in its loading
            // state for the duration of this case.
            useValue: { getD787jDeficiency: () => NEVER, getSparesLessThan50Percent: () => NEVER },
          },
        ],
      });
      const fixture = TestBed.createComponent(SpareStatusList);
      fixture.detectChanges();

      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
      expect(text).not.toContain("No deficiencies against D787J");
    });
  });

  describe("the shared Spares < 50% route", () => {
    it("has no Qty Deficient column", async () => {
      const fixture = await create("less-than-50", [spare("PN-1", 6, 4)]);

      expect(headers(fixture.componentInstance.columnDefs())).not.toContain("Qty Deficient");
      expect(fixture.componentInstance.printColumns().map((c) => c.header)).not.toContain(
        "Qty Deficient",
      );
    });

    it("keeps the column set it had before this change", async () => {
      const fixture = await create("less-than-50", [spare("PN-1", 6, 4)]);

      expect(headers(fixture.componentInstance.columnDefs())).toEqual([
        "Pattern Number",
        "Spare Description",
        "Category",
        "Qty Authorised",
        "Qty Held",
        "Critical",
        "Authority",
        "Equipment Class",
        "Spare Class",
        "Actions",
      ]);
    });

    it("shows no D787J empty state when it has no rows", async () => {
      const fixture = await create("less-than-50", []);
      const text = (fixture.nativeElement as HTMLElement).textContent ?? "";

      expect(text).not.toContain("No deficiencies against D787J");
    });
  });
});
