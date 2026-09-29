import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http";
import { Injectable, inject } from "@angular/core";
import { Observable, ReplaySubject, combineLatest, forkJoin, of, throwError, timer } from "rxjs";
import { catchError, map, share, switchMap } from "rxjs/operators";

import { resolveCmmsApiUrl, resolveAuthApiUrl } from "../../../../../environments/api-url";
import { getErrorMessage, skipFeedback } from "../../../../Core/http/services/http-feedback";
import {
  CriticalityStrength,
  DropdownOptionDto,
  ExistingSpareSummary,
  IncreaseHoldingPayload,
  PLACEHOLDER_SPARE_IMAGE_NAME,
  Spare,
  SpareCategory,
  SpareConflict,
  SpareFormPayload,
  SpareSearchFilters,
  VendorPilImportResult,
  VendorPilImportRowError,
} from "../models/spare.model";
import {
  InventoryUsersReason,
  IssueListEntry,
  IssueReason,
  IssuedReturnedTrend,
  MultiIssuePayload,
  MultiIssueResult,
  OTHER_UNIT_USERS_PAGE_SIZE,
  ObsDashboardCounts,
  ObsUserOption,
  OtherUnitFilterOption,
  OtherUnitUser,
  OtherUnitUserFilters,
  OtherUnitUserPage,
  OtherUnitUserQuery,
  ReturnedItemStatus,
  ReturnSparePayload,
} from "../models/issue.model";
import {
  IssueRequisitionPayload,
  IssueRequisitionRow,
  ParentInventory,
  RequisitionEntry,
  SendToCartPayload,
} from "../models/requisition.model";
import {
  DemandDetailsPayload,
  DemandEntry,
  IifEntry,
  SurveyDetailsPayload,
  SurveyEntry,
  VerifyPatternResult,
  VerifyPatternSource,
} from "../models/transaction.model";
import { HistoryEntry, HistoryFilters } from "../models/history.model";
import {
  BackendAuthority,
  BackendDemand,
  BackendDenomination,
  BackendEquipmentClass,
  BackendSfdListResponse,
  BackendSfdTransactionListResponse,
  BackendIssue,
  BackendIssueListEntry,
  BackendLookup,
  BackendMasterDropdown,
  BackendMultiIssueResult,
  BackendNotInCattedItem,
  BackendObsInventoryUser,
  BackendObsInventoryUsersResponse,
  BackendOtherUnitFilterOption,
  BackendOtherUnitUser,
  BackendOtherUnitUserFiltersResponse,
  BackendOtherUnitUsersResponse,
  BackendDefectRequisitionRow,
  BackendReturn,
  BackendRoutineRequisitionRow,
  BackendSpare,
  BackendSpareClass,
  BackendSurvey,
  BackendTyLoanPair,
  BackendVendorPilImportEnvelope,
  BackendVendorPilImportTaskStatus,
  BackendVerifyPatternResult,
  ObsMasterMaps,
  BackendActiveUsersResponse,
} from "../models/obs-backend.model";

// Developed with Understanding: the three MO/WED cart workflows, named once so the add-to-cart
// URL map and both cart methods share one type (lint rule sonarjs/use-type-alias).
type CartWorkflow = "Survey" | "PTS" | "Demand";

const ISSUE_REMARKS: Record<IssueReason, string> = {
  Defect: "DEFECT",
  "Ty Loan - Other Ship": "TY LOAN",
};

/** `shareReplay(1)` caches (and replays forever) whatever the *first* subscriber saw — including a
 * one-off failure (a transient network blip, or a request that raced ahead of the auth token being
 * attached). Once that happens, every dropdown/lookup fed by the cached stream stays permanently
 * empty for the rest of the browser session, with no visible error, until a hard reload creates a
 * fresh service instance. `resetOnError: true` drops the cached failure so the next subscriber
 * re-issues the request instead of replaying the same dead result forever. */
function cachedUntilError<T>() {
  return share<T>({
    connector: () => new ReplaySubject<T>(1),
    resetOnError: true,
    resetOnComplete: false,
    resetOnRefCountZero: false,
  });
}

/** True when the URL the API sent is the shared "no photograph" artwork rather than a
 * photograph of this spare. `Spares.image` defaults to `obs/default.png` and
 * `SparesSerializer` serialises that default like any other value, so `view/<pk>/` and
 * `search_result/` both hand out a perfectly loadable URL for a spare nobody has photographed.
 * The query string is trimmed first because a cache-busting or signed-URL suffix would otherwise
 * defeat the test. `get_spare_detail/<pk>/` already applies the same `endswith` rule server-side
 * and has no front-end caller, so this is the only place the two screens can be made to agree
 * without a contract change. */
function isPlaceholderSpareImage(url: string | null | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0] ?? "";
  return path.endsWith(PLACEHOLDER_SPARE_IMAGE_NAME);
}

// Developed with Understanding: one `inventory-users` row to the UI model. Shared by the no-reason
// directory (`inventoryUsers$`) and the per-reason lists so both read a person identically.
function toObsUserOption(user: BackendObsInventoryUser): ObsUserOption {
  return {
    id: String(user.id),
    name: user.name,
    rank: user.rank,
    personalNumber: user.personal_number,
    role: user.role,
    unitName: user.unit_name,
    designation: user.designation,
    isOwnUnit: user.is_own_unit,
    isAdUser: user.is_ad_user,
    selectable: user.selectable,
    inScope: user.in_scope,
    selectableForIssue: user.selectable_for_issue,
  };
}

// Developed with Understanding: one `other-unit-users` row to the Ty Loan picker model.
function toOtherUnitUser(user: BackendOtherUnitUser): OtherUnitUser {
  return {
    id: String(user.id),
    name: user.name,
    personalNumber: user.personal_number,
    rank: user.rank,
    unitName: user.unit_name,
    unitCode: user.unit_code,
    commandCode: user.command_code,
    commandName: user.command_name,
    designation: user.designation,
    role: user.role,
    isOwnUnit: user.is_own_unit,
    selectableForIssue: user.selectable_for_issue,
  };
}

// Developed with Understanding: one filter option, copied field for field so the component never
// holds a wire type.
function toOtherUnitFilterOption(option: BackendOtherUnitFilterOption): OtherUnitFilterOption {
  return { code: option.code, name: option.name, count: option.count };
}

/**
 * Ship Inventory - OBS API — talks to `backend/obs` (`api/v1/onboard-spares/...`).
 *
 * The backend serializers are id-only / snake_case (e.g. `Spares.equipment_class` is a plain FK
 * id, `spare_class` is only reachable via `equipment_class.spare_class`). The UI models in
 * `../models/*.model.ts` are flat, human-readable camelCase DTOs, so every method here joins the
 * raw response against cached master-data lookups (`masterMaps$`) and/or the full spares table
 * (`sparesById$`) before returning. Both caches are fetched once per app session and cached
 * (`cachedUntilError()`) — a failed first fetch doesn't get stuck cached, unlike a bare `shareReplay(1)`.
 *
 * A handful of methods have no working backend endpoint yet (noted inline as `BACKEND GAP`) —
 * they fail loudly via `throwError` (or return an empty list for read endpoints) instead of
 * silently faking success.
 */
@Injectable({ providedIn: "root" })
export class ObsApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${resolveCmmsApiUrl()}api/v1/onboard-spares/`;

  private readonly rawSpareClasses$ = this.http
    .get<BackendSpareClass[]>(`${this.baseUrl}spare_class/`)
    .pipe(cachedUntilError());

  private readonly rawEquipmentClasses$ = this.http
    .get<BackendEquipmentClass[]>(`${this.baseUrl}equipment_class/`)
    .pipe(cachedUntilError());

  private readonly rawDenominations$ = this.http
    .get<BackendDenomination[]>(`${this.baseUrl}denominations/`)
    .pipe(cachedUntilError());

  private readonly rawAuthorities$ = this.http
    .get<BackendAuthority[]>(`${this.baseUrl}authorities/`)
    .pipe(cachedUntilError());

  private readonly rawMasterDropdown$ = this.http
    .get<BackendMasterDropdown>(`${this.baseUrl}spares/master-dropdown/`)
    .pipe(cachedUntilError());

  private readonly rawDepartments$ = this.rawMasterDropdown$.pipe(
    map((response) => response.departments),
  );

  private readonly masterMaps$: Observable<ObsMasterMaps> = combineLatest([
    this.rawSpareClasses$,
    this.rawEquipmentClasses$,
    this.rawDenominations$,
    this.rawAuthorities$,
    this.rawDepartments$,
  ]).pipe(
    map(([spareClasses, equipmentClasses, denominations, authorities, departments]) => ({
      spareClassNameById: new Map(spareClasses.map((c) => [c.id, c.name])),
      equipmentClassById: new Map(
        equipmentClasses.map((c) => [c.id, { name: c.name, spareClassId: c.spare_class }]),
      ),
      denominationNameById: new Map(denominations.map((d) => [d.id, d.name])),
      authorityNameById: new Map(authorities.map((a) => [a.id, a.name])),
      departmentIdBySpareClassId: new Map(spareClasses.map((c) => [c.id, c.department])),
      departmentNameById: new Map(departments.map((d) => [d.id, d.name])),
    })),
    cachedUntilError(),
  );

  /** Full spares table, keyed by id — used to join pattern_number/description/etc onto the
   * id-only Issue/Return/Survey/Demand/IIF rows returned by the transaction endpoints. */
  private readonly sparesById$: Observable<Map<number, BackendSpare>> = this.http
    .get<BackendSpare[]>(`${this.baseUrl}spares/`)
    .pipe(
      map((rows) => new Map(rows.map((row) => [row.id, row]))),
      cachedUntilError(),
    );

  /** Every profile that can sign in, across departments — the one directory behind all three
   * of Ship Inventory's people-pickers ("Issued To" on Issue Spare and on Requisition Issue,
   * "Returned by" on Return) AND the grids' own id -> name/unit lookup, since
   * `IssueSerializer.username` is a bare profile id.
   *
   * Unfiltered on purpose: a spare already issued to a seeded account still has to READ
   * correctly in the Return/History/Dashboard grids, so every profile stays in the map. Which
   * of them a picker may OFFER is the per-row `selectable`/`inScope` flags, applied at each
   * call site. Cached like the other master lookups on this service. */
  private readonly inventoryUsers$: Observable<ObsUserOption[]> = this.http
    // Lives on `ReturnViewSet` (obs/views/workflow.py), registered under the `returns/` router
    // prefix — not `issues/` — despite serving the Issue-side pickers too (see class doc above).
    .get<BackendObsInventoryUsersResponse>(`${this.baseUrl}returns/inventory-users/`)
    .pipe(
      // Developed with Understanding: same mapping as before, moved into toObsUserOption() so the
      // per-reason lists share it, plus the new designation.
      map((response) => response.users.map(toObsUserOption)),
      cachedUntilError(),
    );

  // Developed with Understanding: one cached stream per `reason`, kept apart from
  // `inventoryUsers$` so the no-reason directory that Requisition Issue, Return and the grids read
  // keeps its own cache and behaviour (R2 Q13).
  private readonly inventoryUsersByReason = new Map<InventoryUsersReason, Observable<ObsUserOption[]>>();

  /** issue_list (pending-return) pk -> spare id, populated by `getReturnList()` and consumed by
   * `returnSpare()` since `ReturnSerializer` takes a `spare_id`, not an issue/issue-list pk. */
  private readonly returnListSpareByIssuePk = new Map<string, string>();

  /** not-in-catted-item pk -> spare id, populated by `getIifList()` and consumed by
   * `updateIifPatternNumber()` since `update-spare-pattern/` needs the Spares pk. */
  private readonly iifSpareByEntryId = new Map<string, string>();

  // ---------------------------------------------------------------------------------------
  // Master / dropdown data
  // ---------------------------------------------------------------------------------------

  getSpareClasses(): Observable<DropdownOptionDto[]> {
    return this.rawSpareClasses$.pipe(map(toDropdownOptions));
  }

  getEquipmentClasses(): Observable<DropdownOptionDto[]> {
    return this.rawEquipmentClasses$.pipe(map(toDropdownOptions));
  }

  getDenominations(): Observable<DropdownOptionDto[]> {
    return this.rawDenominations$.pipe(map(toDropdownOptions));
  }

  getAuthorities(): Observable<DropdownOptionDto[]> {
    return this.rawAuthorities$.pipe(map(toDropdownOptions));
  }

  /** "Sub-Department" dropdown — Issue Spare's Defect branch. Sourced from SFD's real
   * Ship-Owned Sub-Departments master (Ship Configuration > Configuration), not `ems` — the
   * caller's own department scoping happens server-side in `sfd_list()`. `sfd/list/`'s
   * `metadata.sub_departments` already covers this without a separate `sub-departments/`
   * CRUD-endpoint call. */
  getSfdSubDepartments(): Observable<DropdownOptionDto[]> {
    return this.http
      .get<BackendSfdListResponse>(`${resolveCmmsApiUrl()}api/v1/sfd/list/`)
      .pipe(map((response) => toDropdownOptions(response.metadata.sub_departments)));
  }

  /** "Defect on Equipment Nomenclature" dropdown — the real "Active Systems & Equipment" list
   * (Ship Configuration > SFD Details), NOT `sfd/list/`'s equipment (that one only returns rows
   * whose `sub_department_f_key` matches — real `ShipEquipment` data typically doesn't have that
   * set, so it silently comes back empty). `sub_dep` is passed only when a sub-department is
   * picked, matching the reference screen's own optional-filter behavior; unfiltered, it lists
   * every active equipment row for the ship. `page_size=100` (the endpoint's max) since this
   * backs a dropdown, not a paged grid — fine for realistic per-ship equipment counts. */
  getSfdEquipment(subDepartmentId?: string): Observable<DropdownOptionDto[]> {
    return this.http
      .get<BackendSfdTransactionListResponse>(`${resolveCmmsApiUrl()}api/v1/sfd/sfd-list/`, {
        params: subDepartmentId ? { sub_dept: subDepartmentId, page_size: 100 } : { page_size: 100 },
      })
      .pipe(
        map((response) =>
          response.results.map((row) => ({
            value: String(row.equipment_ship_id),
            label: row.nomenclature || row.equipment_name || row.equipment_code || `#${row.equipment_ship_id}`,
          })),
        ),
      );
  }

  /** The user directory behind every Ship Inventory people-picker, and behind the grids'
   * id -> name lookup. `id` is the `CustomUserProfile` pk, matching `Issue.username`'s FK
   * target.
   *
   * This replaced a second call to `api/v1/user/users/active/`, which Inventory was the only
   * consumer of anywhere in the application. That endpoint offered the accounts `seed_all.py`
   * writes (`PN0001`…) with no way to tell them from real personnel, and labelled every option
   * with a bare name — blank on most seeded rows. Callers filter on `selectable` (real
   * personnel) and, for the two "Issued To" pickers, `inScope` (the caller's own department,
   * which the old endpoint applied server-side and this one carries as a flag). */
  // Developed with Understanding: `reason` is optional. Absent, this is the unchanged no-reason
  // directory (Requisition Issue keeps calling it that way, R2 Q13). `DEFECT` asks for own-ship
  // personnel only - user_active, no ship_leaving_date (D5, CP-G contract section 2) - and is
  // cached on its own, the same cachedUntilError() way.
  getInventoryUsers(reason?: InventoryUsersReason): Observable<ObsUserOption[]> {
    if (!reason) {
      return this.inventoryUsers$;
    }
    let cached = this.inventoryUsersByReason.get(reason);
    if (!cached) {
      cached = this.http
        .get<BackendObsInventoryUsersResponse>(`${this.baseUrl}returns/inventory-users/`, {
          params: { reason },
        })
        .pipe(
          map((response) => response.users.map(toObsUserOption)),
          cachedUntilError(),
        );
      this.inventoryUsersByReason.set(reason, cached);
    }
    return cached;
  }

  // Developed with Understanding: GET `returns/other-unit-users/` - the Ty Loan Issued To field's
  // server search over current other-unit personnel (D11, D12). First page only, 20 rows. Blank
  // parts are left out of the query by toParams(). The loader is skipped because the screen shows
  // its own loading line and this fires as the operator types.
  getOtherUnitUsers(query: OtherUnitUserQuery): Observable<OtherUnitUserPage> {
    return this.http
      .get<BackendOtherUnitUsersResponse>(`${this.baseUrl}returns/other-unit-users/`, {
        params: this.toParams({
          command: query.command,
          unit: query.unit,
          search: query.search.trim(),
          page: 1,
          page_size: OTHER_UNIT_USERS_PAGE_SIZE,
        }),
        context: skipFeedback({ loader: true }),
      })
      .pipe(
        map((response) => ({ count: response.count, users: response.results.map(toOtherUnitUser) })),
      );
  }

  // Developed with Understanding: GET `returns/other-unit-users/filters/` - the Command options and
  // the Unit Name options, the units narrowed by `command` when one is given (D11). Values only,
  // never a person. Loader skipped for the same reason as getOtherUnitUsers().
  getOtherUnitUserFilters(command?: string): Observable<OtherUnitUserFilters> {
    return this.http
      .get<BackendOtherUnitUserFiltersResponse>(`${this.baseUrl}returns/other-unit-users/filters/`, {
        params: this.toParams({ command }),
        context: skipFeedback({ loader: true }),
      })
      .pipe(
        map((response) => ({
          commands: response.commands.map(toOtherUnitFilterOption),
          units: response.units.map(toOtherUnitFilterOption),
        })),
      );
  }
  /** "Issued To" dropdown — Issue Spare's Defect branch. Department-scoped active users;
   * `id` is the `CustomUserProfile` pk, matching `Issue.username`'s FK target. */
  getActiveUsers(): Observable<DropdownOptionDto[]> {
    const authUrl = resolveAuthApiUrl() || resolveCmmsApiUrl();
    return this.http
      .get<BackendActiveUsersResponse>(`${authUrl}api/v1/auth/users/active/`)
      .pipe(
        map((response) =>
          response.history_users.map((user) => ({ value: String(user.id), label: user.name })),
        ),
      );
  }

  /** Cascade for Add Spare's "Equipment Class" dropdown once a "Class of Spares" is picked —
   * filters the already-loaded, already department-scoped `rawEquipmentClasses$` (see
   * `getEquipmentClasses()`) client-side rather than a fresh request, since the full list is
   * already cached and every row carries its parent `spare_class` id. No department parameter
   * needed: `spare_class/` and `equipment_class/`'s plain list endpoints are scoped server-side
   * to the caller's own department via `DepartmentScopedFilterBackend` (privileged users see
   * every department's classes), so there is nothing left for the frontend to filter by. */
  getEquipmentClassesForSpareClass(spareClassId: string): Observable<DropdownOptionDto[]> {
    return this.rawEquipmentClasses$.pipe(
      map((classes) => classes.filter((c) => String(c.spare_class) === spareClassId)),
      map(toDropdownOptions),
    );
  }

  /** References > Masters > Import Data "Select Department" — the same `departments` list
   * `master_dropdown` already fetches for `masterMaps$`'s name lookups, just not previously
   * exposed as its own dropdown. */
  getDepartmentOptions(): Observable<DropdownOptionDto[]> {
    return this.rawDepartments$.pipe(map(toDropdownOptions));
  }

  /** `GET selectable-departments/` — the departments THIS caller may import
   * on behalf of, and whether the control locks to one.
   *
   * Not `getDepartmentOptions()` above, which reads `master_dropdown`'s `departments` key. That
   * list is unscoped by design and is also what `masterMaps$` builds `departmentNameById` out of,
   * so scoping it would leave a privileged account unable to render a department name anywhere.
   * The import form needed a scoped answer and gets its own endpoint rather than breaking the
   * other consumer — see the back end's own comment on `master_dropdown`.
   *
   * Deliberately NOT cached with `cachedUntilError()`, for the same reason `getImportAuthorities`
   * is not: this is a permission answer, and a permission answer must be re-asked rather than
   * remembered for the life of the app session. */
  getSelectableDepartments(): Observable<SelectableDepartments> {
    return this.http
      .get<SelectableDepartmentsRawResponse>(`${this.baseUrl}spares/selectable-departments/`)
      .pipe(
        map((response) => ({
          departments: toDropdownOptions(response.departments),
          locked: response.locked,
          selectedDepartment:
            response.selected_department == null ? "" : String(response.selected_department),
        })),
      );
  }

  /** `GET sub-departments/?department=` — the Executive sub-departments
   * this caller may see under one department.
   *
   * Feeds two controls: the dependent field on the import form and the filter on the Ship
   * Inventory listing screen. Both ask the same question, so both read the same endpoint.
   *
   * Do NOT confuse this with `getSectionOptions()` above, which is `ems.SectionName` and belongs
   * to the Spare Data Map tab. They are different models and posting one where the other is
   * expected points the record at the wrong row. */
  getSubDepartments(departmentId?: string): Observable<SubDepartmentList> {
    return this.http
      .get<SubDepartmentListRawResponse>(`${this.baseUrl}spares/sub-departments/`, {
        params: this.toParams({ department: departmentId }),
      })
      .pipe(
        map((response) => ({
          department: response.department == null ? "" : String(response.department),
          isExecutive: response.is_executive,
          subDepartments: response.sub_departments
            .filter((row): row is { id: number; name: string; department_id: number } => !!row)
            .map((row) => ({ value: String(row.id), label: row.name })),
          locked: response.locked,
        })),
      );
  }

  /** References > Masters > Spare Data Map "Sub Department" — `master_dropdown`'s
   * department-scoped `sections` (`ems.SectionName`), already part of that response but
   * previously unused (Issue Spare's own "Sub-Department" picker uses a different, SFD-sourced
   * list — see `getSfdSubDepartments()`). */
  getSectionOptions(): Observable<DropdownOptionDto[]> {
    return this.rawMasterDropdown$.pipe(map((response) => toDropdownOptions(response.sections)));
  }

  // ---------------------------------------------------------------------------------------
  // Spares search / CRUD — GET/POST/PUT api/v1/onboard-spares/{search_result,view,add,edit}/
  // ---------------------------------------------------------------------------------------

  searchSpares(filters: SpareSearchFilters): Observable<Spare[]> {
    const params = this.toParams({
      department: filters.department,
      // The sub-department dimension of the Ship Inventory listing.
      sub_department: filters.subDepartment,
      spare_class: filters.spareClass,
      equipment_class: filters.equipmentClass,
      equipment: filters.equipmentClassText,
      pattern_number: filters.patternNumber,
      description: filters.description,
      remarks: filters.remarksText,
      q: filters.q,
    });
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .get<BackendSpare[]>(`${this.baseUrl}spares/search/`, { params })
          .pipe(map((rows) => rows.map((row) => this.adaptSpare(row, maps)))),
      ),
    );
  }

  exportSparesExcel(filters: SpareSearchFilters): Observable<Blob> {
    const params = this.toParams({
      department: filters.department,
      // The sub-department dimension of the Ship Inventory listing.
      sub_department: filters.subDepartment,
      spare_class: filters.spareClass,
      equipment_class: filters.equipmentClass,
      equipment: filters.equipmentClassText,
      pattern_number: filters.patternNumber,
      description: filters.description,
      remarks: filters.remarksText,
      q: filters.q,
    });
    return this.http.get(`${this.baseUrl}spares/export-excel/`, { params, responseType: "blob" });
  }

  getSpare(id: string): Observable<Spare> {
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .get<BackendSpare>(`${this.baseUrl}spares/${id}/`)
          .pipe(map((row) => this.adaptSpare(row, maps))),
      ),
    );
  }

  getSpares(ids: string[]): Observable<Spare[]> {
    if (!ids.length) return of([]);
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        forkJoin(ids.map((id) => this.http.get<BackendSpare>(`${this.baseUrl}spares/${id}/`))).pipe(
          map((rows) => rows.map((row) => this.adaptSpare(row, maps))),
        ),
      ),
    );
  }

  /** Add Spare. Uses `skipFeedback({ toast: true })` because the two conflict
   * responses (`409`) get their own purpose-built UI in `spare-add.ts` rather than
   * the generic error toast — see `parseSpareConflict()`. Pass
   * `confirmDuplicateDescription: true` to resubmit past a description-only
   * conflict the user has explicitly chosen to proceed past. */
  addSpare(
    payload: SpareFormPayload,
    options?: { confirmDuplicateDescription?: boolean },
  ): Observable<{ spare: Spare; patternNumberGenerated: boolean }> {
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .post<BackendSpare & { pattern_number_generated: boolean }>(
            `${this.baseUrl}spares/`,
            this.buildSpareFormData(payload, options),
            { context: skipFeedback({ toast: true }) },
          )
          .pipe(
            map((row) => ({
              spare: this.adaptSpare(row, maps),
              patternNumberGenerated: row.pattern_number_generated,
            })),
            catchError((error: unknown) => {
              const conflict = parseSpareConflict(error);
              if (conflict) return throwError(() => conflict);
              return throwError(() => new Error(describeSpareCreateError(error)));
            }),
          ),
      ),
    );
  }

  /** Existing Spare — increase the held quantity of a spare already on the
   * inventory. Deliberately separate from the `addSpare/` endpoint (backed by
   * `add_from_ilms`, which issues stock *out* against an existing pattern number —
   * an entirely different, misleadingly-named action). */
  increaseSpareHolding(
    spareId: string,
    payload: IncreaseHoldingPayload,
  ): Observable<Spare> {
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .post<{ spare: BackendSpare }>(`${this.baseUrl}spares/${spareId}/increase-holding/`, {
            quantity_to_add: payload.quantityToAdd,
            remarks: payload.remarks,
          })
          .pipe(map((response) => this.adaptSpare(response.spare, maps))),
      ),
    );
  }

  updateSpare(id: string, payload: SpareFormPayload): Observable<Spare> {
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .put<BackendSpare>(`${this.baseUrl}spares/${id}/`, this.buildSpareFormData(payload))
          .pipe(map((row) => this.adaptSpare(row, maps))),
      ),
    );
  }

  issueMultiple(payload: MultiIssuePayload): Observable<MultiIssueResult> {
    const items = payload.rows.map((row) => ({
      spare: Number(row.spareId),
      quantity: row.quantityIssued,
      high_quantity_reason: row.highQuantityReason || "",
    }));
    // Developed with Understanding: the recipient travels by reason (CP-G contract section 5). A
    // Ty Loan sends only `issued_to_other_profile` - no `username` and no `issued_to_unit`, which
    // the server fills from the picked person's unit (D11). A Defect sends `username` and the blank
    // `issued_to_unit` it always sent. The free-text "Issued to Ship" and "Enter Ship Name" boxes,
    // and the comment that explained which of them won, are gone with the controls (D11). Tested
    // through ISSUE_REMARKS so the stored TY LOAN string stays the single source (D10).
    const recipient =
      ISSUE_REMARKS[payload.reason] === ISSUE_REMARKS["Ty Loan - Other Ship"]
        ? { issued_to_other_profile: this.toOptionalId(payload.issuedToOtherProfile) }
        : { username: this.toOptionalId(payload.username), issued_to_unit: "" };
    return this.http
      .post<BackendMultiIssueResult>(`${this.baseUrl}spares/multi-issue/`, {
        items,
        remarks: ISSUE_REMARKS[payload.reason],
        equipment: this.toOptionalId(payload.equipmentName),
        ...recipient,
      })
      .pipe(
        map(() => ({
          // `multi_issue/` is all-or-nothing (a single validation error aborts the whole batch),
          // so a successful response means every requested row was issued.
          issued: payload.rows.map((row) => row.patternNumber),
          errors: [] as MultiIssueResult["errors"],
        })),
      );
  }

  // ---------------------------------------------------------------------------------------
  // Pending-return list (Issue + IssueList) and returns
  // ---------------------------------------------------------------------------------------

  getReturnList(): Observable<IssueListEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$, this.inventoryUsers$]).pipe(
      switchMap(([maps, sparesById, users]) =>
        forkJoin({
          issueList: this.http.get<BackendIssueListEntry[]>(`${this.baseUrl}issue-list/`),
          issues: this.http.get<BackendIssue[]>(`${this.baseUrl}issues/issued-to-maintainers/`),
        }).pipe(
          map(({ issueList, issues }) => {
            const issueById = new Map(issues.map((issue) => [issue.id, issue]));
            const usersById = new Map(users.map((user) => [user.id, user]));
            this.returnListSpareByIssuePk.clear();
            const rows: IssueListEntry[] = [];
            for (const entry of issueList) {
              const issue = issueById.get(entry.issue_entry);
              if (!issue) continue;
              this.returnListSpareByIssuePk.set(String(entry.id), String(issue.spare));
              rows.push(
                this.adaptIssueToListEntry(
                  issue,
                  sparesById.get(issue.spare),
                  maps,
                  entry.id,
                  usersById,
                  // What is still owed on this row, as opposed to what was originally issued.
                  // The endpoint has always sent it and this list has always thrown it away,
                  // which is why a partly-returned row went on showing its full issued figure.
                  entry.quantity_toreturn,
                ),
              );
            }
            return rows;
          }),
        ),
      ),
    );
  }

  returnSpare(issuePk: string, payload: ReturnSparePayload): Observable<void> {
    const spareId = this.returnListSpareByIssuePk.get(issuePk);
    if (!spareId) {
      return throwError(
        () => new Error("Unable to resolve the spare for this return — reload the list and try again."),
      );
    }
    return this.http
      .post<BackendReturn>(
        `${this.baseUrl}returns/`,
        {
          spare_id: Number(spareId),
          // Which pending-return row this settles. A spare can be out on issue to several
          // people at once, so without this the server can only guess which one came back —
          // it used to take the oldest, closing somebody else's row.
          issue_list_id: Number(issuePk),
          returned_by: Number(payload.returnedBy),
          remarks: payload.remarks,
          quantity_returned: payload.quantityReturned,
        },
        // The caller raises its own message, which says how many came back on charge and what
        // is still outstanding. Without this the interceptor's generic "Operation completed
        // successfully." stacks a second, emptier toast on top of it.
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(
        map((created) => {
          // BACKEND GAP: `Return` has no column for the "Same as Issued / New Item" choice made
          // in the Return modal — the serializer drops it. Persisted client-side (keyed by the
          // new Return row's id) so Return History can still show it for returns made from here.
          this.setReturnItemStatus(created.id, payload.itemStatus);
        }),
      );
  }

  // ---------------------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------------------

  getDashboardCounts(): Observable<ObsDashboardCounts> {
    return forkJoin({
      sparesIssuedToMaintainers: this.getSparesIssuedToMaintainers(),
      sparesIssuedOnTyLoan: this.getSparesIssuedOnTyLoan(),
      sparesReturned: this.getSparesReturnedList(),
      sparesLessThan50Percent: this.getSparesLessThan50Percent(),
      d787jDeficiency: this.getD787jDeficiency(),
      criticalSpareList: this.getCriticalSpareList(),
    }).pipe(
      map((results) => ({
        sparesIssuedToMaintainers: results.sparesIssuedToMaintainers.length,
        sparesIssuedOnTyLoan: results.sparesIssuedOnTyLoan.length,
        sparesReturned: results.sparesReturned.length,
        sparesLessThan50Percent: results.sparesLessThan50Percent.length,
        d787jDeficiency: results.d787jDeficiency.length,
        criticalSpareList: results.criticalSpareList.length,
      })),
    );
  }

  getIssuedReturnedTrend(): Observable<IssuedReturnedTrend> {
    const monthKeys = this.lastSixMonthKeys();
    return forkJoin({
      defectIssues: this.http.get<BackendIssue[]>(`${this.baseUrl}issues/`, {
        params: this.toParams({ remarks: "DEFECT" }),
      }),
      tyLoanPairs: this.http.get<BackendTyLoanPair[]>(`${this.baseUrl}issues/ty-loan/`),
      allReturns: this.http.get<BackendReturn[]>(`${this.baseUrl}returns/returned-spares/`),
    }).pipe(
      map(({ defectIssues, tyLoanPairs, allReturns }) => {
        const tyLoanReturnDates = tyLoanPairs.map((pair) => pair.return?.return_time ?? null);
        const allReturnDates = allReturns.map((row) => row.return_time);
        const tyLoanReturned = this.countByMonth(tyLoanReturnDates, monthKeys);
        const allReturned = this.countByMonth(allReturnDates, monthKeys);
        // `Return` has no defect/ty-loan reason of its own — ty-loan returns are known from the
        // matched issue/return pairs above, so "defect" returns are approximated as the remainder.
        const defectReturned = allReturned.map((total, i) => Math.max(total - tyLoanReturned[i], 0));

        return {
          months: monthKeys.map((key) => this.monthLabel(key)),
          defect: {
            issued: this.countByMonth(defectIssues.map((issue) => issue.date_of_issue), monthKeys),
            returned: defectReturned,
          },
          tyLoan: {
            issued: this.countByMonth(tyLoanPairs.map((pair) => pair.issue.date_of_issue), monthKeys),
            returned: tyLoanReturned,
          },
        };
      }),
    );
  }

  // ---- Dashboard KPI "View more" drill-downs ----

  getSparesIssuedToMaintainers(): Observable<IssueListEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendIssue[]>(`${this.baseUrl}issues/issued-to-maintainers/`).pipe(
          map((issues) =>
            issues.map((issue) =>
              this.adaptIssueToListEntry(issue, sparesById.get(issue.spare), maps, issue.id),
            ),
          ),
        ),
      ),
    );
  }

  getSparesIssuedOnTyLoan(): Observable<IssueListEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendTyLoanPair[]>(`${this.baseUrl}issues/ty-loan/`).pipe(
          map((pairs) =>
            pairs.map((pair) =>
              this.adaptIssueToListEntry(
                pair.issue,
                sparesById.get(pair.issue.spare),
                maps,
                pair.issue.id,
              ),
            ),
          ),
        ),
      ),
    );
  }

  getSparesReturnedList(): Observable<HistoryEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http
          .get<BackendReturn[]>(`${this.baseUrl}returns/returned-spares/`)
          .pipe(map((rows) => rows.map((row) => this.adaptReturnToHistoryEntry(row, sparesById, maps)))),
      ),
    );
  }

  getSparesLessThan50Percent(): Observable<Spare[]> {
    return this.getSpareListAction("spares/low-stock/");
  }

  getD787jDeficiency(): Observable<Spare[]> {
    return this.getSpareListAction("spares/d787j-deficiency/");
  }

  getCriticalSpareList(): Observable<Spare[]> {
    return this.getSpareListAction("spares/critical/");
  }

  // ---------------------------------------------------------------------------------------
  // Maintainer Spare Requests (Routine / Defect DART)
  //
  // `requisition_details/`/`defect_requisition_details/` (`PlannedRoutineSpareListViewSet
  // .requisition`/`SparesViewSet.defect_requisition`) now return every pending row when called
  // with no id (previously mandatory, 400'd otherwise). Neither action embeds the routine's
  // name/number or the spare's category/authority/qty-authorised — only a `pattern_number` and an
  // `onboard_spare` pk — so those are joined in here from the same `sparesById$` cache the rest of
  // this service already uses. DART assignment (`raiseDartForDefectRequisitions`) and MO/WED cart
  // forwarding (`sendRequisitionsToCart`) still have no backend endpoint anywhere and remain
  // stubbed.
  // ---------------------------------------------------------------------------------------

  getRoutineRequisitions(): Observable<RequisitionEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendRoutineRequisitionRow[]>(`${this.baseUrl}planned-routine-spare-lists/requisition/`).pipe(
          map((rows) =>
            rows.map((row) =>
              this.adaptRoutineRequisition(row, row.onboard_spare != null ? sparesById.get(row.onboard_spare) : undefined, maps),
            ),
          ),
        ),
      ),
    );
  }

  getDefectRequisitions(): Observable<RequisitionEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendDefectRequisitionRow[]>(`${this.baseUrl}spares/defect-requisition/`).pipe(
          map((rows) =>
            rows.map((row) =>
              this.adaptDefectRequisition(row, row.onboard_spare != null ? sparesById.get(row.onboard_spare) : undefined, maps),
            ),
          ),
        ),
      ),
    );
  }

  /** `delete-requisition-spare/` (routine) / `delete-defect-requisition-spare/` (defect) — real,
   * working endpoints, unlike the cart/DART actions below. `inventory_type` is always "OBS" here
   * since these requisitions all originate from this ship's own onboard-spares store. */
  deleteRequisition(kind: "routine" | "defect", id: string): Observable<void> {
    const endpoint = kind === "defect" ? "delete-defect-requisition-spare/" : "delete-requisition-spare/";
    return this.http
      .post(`${this.baseUrl}planned-routine-spare-lists/${endpoint}`, { pk: Number(id), inventory_type: "OBS" })
      .pipe(map(() => void 0));
  }

  /** `ApprovalWorkflowMixin.add_to_cart` (`ilms`/`wlms`) — one URL per parent inventory x
   * workflow, all sharing the same `{source: "dart", source_ids: [...]}` request shape. Promotes
   * the just-created `DartMOSpare`/`DartWedSpare` rows into the real `SurveyDetails` /
   * `PTSDetails` / `DemandDetails` records the MO/WED "Survey Cart"/"PTS Cart"/"Demand Cart" pages
   * actually list — without this step a `DartMOSpare`/`DartWedSpare` row is created but never
   * shows up anywhere in the MO/WED module. */
  // Router prefixes: `ilms/urls.py` registers `SurveyDetailsViewSet`/`PTSDetailsViewSet`/
  // `DemandDetailsViewSet` at "surveys"/"pts"/"demands"; `wlms/urls.py` registers
  // `SurveyReceiptsDetailsViewSet`/`PTSDemandDetailsViewSet`/`DemandDetailsViewSet` at
  // "survey-receipts"/"pts-demands"/"demands". These previously pointed at a since-removed flat
  // URL scheme (`ilms/transaction/...`, `wlms/survey/...`, singular `wlms/demand/...`) that 404s
  // on the current backend — silently breaking the OBS -> MO/WED handoff for 5 of these 6 routes
  // (only ILMS PTS happened to still match).
  private static readonly ADD_TO_CART_URLS: Record<ParentInventory, Record<CartWorkflow, string>> = {
    ILMS: {
      Survey: "api/v1/ilms/surveys/add-to-cart/",
      PTS: "api/v1/ilms/pts/add-to-cart/",
      Demand: "api/v1/ilms/demands/add-to-cart/",
    },
    WLMS: {
      Survey: "api/v1/wlms/survey-receipts/add-to-cart/",
      PTS: "api/v1/wlms/pts-demands/add-to-cart/",
      Demand: "api/v1/wlms/demands/add-to-cart/",
    },
  };

  private promoteToWorkflowCart(
    parentInventory: ParentInventory,
    workflow: CartWorkflow,
    sourceIds: number[],
  ): Observable<void> {
    if (!sourceIds.length) return of(void 0);
    const url = `${resolveCmmsApiUrl()}${ObsApiService.ADD_TO_CART_URLS[parentInventory][workflow]}`;
    return this.http
      .post(url, { source: "dart", source_ids: sourceIds }, { context: skipFeedback({ toast: true }) })
      .pipe(map(() => void 0));
  }

  /** `ilms.DartMOSpareViewSet.bulk_create_from_obs` / `wlms.DartWedSpareViewSet.bulk_create_from_obs`
   * — one `DartMOSpare`/`DartWedSpare` cart row per selected requisition/survey/demand row. The
   * backend resolves a catalog item by pattern number itself (same lookup
   * `SparesViewSet.verify_pattern` already trusts); a row with no match is still created
   * (unlinked) rather than dropped, so MO/WED staff can link it manually — `unmatchedCount` tells
   * the caller how many, so it can warn the user. Matched rows are then promoted into the real
   * workflow cart via `promoteToWorkflowCart()`, using `workflow` (not the OBS-side `kind`/
   * `cartType`, which describe the OBS side only) to pick Survey/PTS/Demand. Shared by
   * `sendRequisitionsToCart()`/`sendSurveyToCart()`/`sendDemandToCart()`. */
  private sendToObsCart(
    payload: SendToCartPayload,
    workflow: CartWorkflow,
  ): Observable<{ totalCount: number; unmatchedCount: number }> {
    const url =
      payload.parentInventory === "ILMS"
        ? `${resolveCmmsApiUrl()}api/v1/ilms/dart-mo-spares/bulk-create-from-obs/`
        : `${resolveCmmsApiUrl()}api/v1/wlms/dart-wed-spares/bulk-create-from-obs/`;
    const items = (payload.entries ?? []).map((entry) => ({
      pattern_number: entry.patternNumber,
      description: entry.description,
      quantity: entry.quantity,
    }));
    return this.http
      .post<{ created: { id: number; matched: boolean }[] }>(url, { items }, { context: skipFeedback({ toast: true }) })
      .pipe(
        switchMap((response) => {
          const matchedIds = response.created.filter((row) => row.matched).map((row) => row.id);
          return this.promoteToWorkflowCart(payload.parentInventory, workflow, matchedIds).pipe(
            map(() => ({
              totalCount: response.created.length,
              unmatchedCount: response.created.length - matchedIds.length,
            })),
          );
        }),
      );
  }

  sendRequisitionsToCart(
    _kind: "routine" | "defect",
    payload: SendToCartPayload,
  ): Observable<{ totalCount: number; unmatchedCount: number }> {
    return this.sendToObsCart(payload, payload.cartType);
  }

  /** Uses the DART-aware bulk-issue actions (matched by pattern_number, not spare id) instead of
   * the plain `multi_issue_spare/` — those are the only two endpoints that actually touch the
   * originating `PlannedRoutineSpareList`/`DartSpare` requisition rows server-side.
   *
   * `_create_pattern_issues` is all-or-nothing per *row*, not per *request* — a row with no
   * matching Spares record (routine, "Spare not found") or one that would issue more than the
   * matching Spares record currently has on hand fails individually and is reported back in
   * `errors`, while the rest of the batch still goes through. Returning that split here (instead
   * of collapsing the whole call to `void`) is what lets the caller actually tell the user which
   * rows didn't make it, rather than reporting a blanket "success" no matter what came back. */
  issueRequisition(
    kind: "routine" | "defect",
    payload: IssueRequisitionPayload,
  ): Observable<MultiIssueResult> {
    const endpoint = kind === "defect" ? "spares/defect-multi-issue/" : "spares/routine-multi-issue/";
    const remarks = `${kind.toUpperCase()} REQUISITION`.slice(0, 200);
    // `username` is a real CustomUserProfile-id field on PatternMultiIssueSerializer, not just
    // cosmetic text folded into remarks — matches Issue.username's FK target.
    const username = this.toOptionalId(payload.username);
    const toItems = (rows: IssueRequisitionRow[]) =>
      rows.map((row) => ({ pattern_number: row.patternNumber, quantity_issued: row.quantityIssued }));
    const adaptResult = (response: BackendMultiIssueResult): MultiIssueResult => ({
      issued: response.issued,
      errors: response.errors.map((e) => ({ patternNumber: e.pattern_number, error: e.error })),
    });

    if (kind !== "defect") {
      return this.http
        .post<BackendMultiIssueResult>(`${this.baseUrl}${endpoint}`, {
          items: toItems(payload.rows),
          remarks,
          username,
        })
        .pipe(map(adaptResult));
    }

    // defect_multi_issue_spare/ is scoped to one dart_number per call — group the selected rows
    // by their originating DART and fire one bulk call per group.
    const groups = new Map<string, IssueRequisitionRow[]>();
    for (const row of payload.rows) {
      const key = row.dartNumber ?? "";
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const calls = [...groups.entries()].map(([dartNumber, rows]) =>
      this.http.post<BackendMultiIssueResult>(`${this.baseUrl}${endpoint}`, {
        items: toItems(rows),
        remarks,
        username,
        dart_number: dartNumber || undefined,
      }),
    );
    return forkJoin(calls).pipe(
      map((responses) =>
        responses.map(adaptResult).reduce(
          (acc, r) => ({ issued: [...acc.issued, ...r.issued], errors: [...acc.errors, ...r.errors] }),
          { issued: [] as string[], errors: [] as MultiIssueResult["errors"] },
        ),
      ),
    );
  }

  // ---------------------------------------------------------------------------------------
  // Internal Transactions — Survey
  // ---------------------------------------------------------------------------------------

  getSurveyList(): Observable<SurveyEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http
          .get<BackendSurvey[]>(`${this.baseUrl}surveys/`)
          .pipe(map((rows) => rows.map((row) => this.adaptSurvey(row, sparesById.get(row.spare), maps)))),
      ),
    );
  }

  getSurveyEntry(id: string): Observable<SurveyEntry | undefined> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http
          .get<BackendSurvey>(`${this.baseUrl}surveys/${id}/`)
          .pipe(map((row) => this.adaptSurvey(row, sparesById.get(row.spare), maps))),
      ),
    );
  }

  /** `SurveyViewSet.complete` (`spares/<pk>/` was `view/`/`edit/`-style before the obs backend's
   * router restructuring; this action is now registered via the `surveys` router prefix, so it
   * resolves at `surveys/<pk>/complete/` — the formerly-missing route is wired up. */
  submitSurveyDetails(id: string, payload: SurveyDetailsPayload): Observable<void> {
    return this.http
      .post(`${this.baseUrl}surveys/${id}/complete/`, {
        quantity_surveyed: payload.quantitySurveyed,
        survey_number: payload.surveyNumber,
        survey_report_date: payload.surveyReportDate,
        remarks: payload.remarks,
      })
      .pipe(map(() => void 0));
  }

  /** BACKEND GAP: `SurveyViewSet.raise_dart` now unconditionally raises a validation error
   * (`RAISE_DART_RETIRED_MESSAGE`) on the restructured obs backend — the action is deliberately
   * retired server-side, per its own comment: "the two queue screens must refuse identically, and
   * neither may mint a DART number that competes with the one the form raises." The replacement
   * flow (row click seeds a `DartSeedStore` and navigates to the real DART form instead of calling
   * this action) has not been ported into `survey-list.ts` yet — this call will now always fail
   * with that retirement message until that hand-off is wired up. */
  raiseDartForSurvey(ids: string[]): Observable<void> {
    return this.http
      .post(`${this.baseUrl}surveys/raise-dart/`, { ids: ids.map(Number) })
      .pipe(map(() => void 0));
  }

  sendSurveyToCart(payload: SendToCartPayload): Observable<{ totalCount: number; unmatchedCount: number }> {
    return this.sendToObsCart(payload, payload.cartType);
  }

  // ---------------------------------------------------------------------------------------
  // Internal Transactions — Demand
  // ---------------------------------------------------------------------------------------

  getDemandList(): Observable<DemandEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http
          .get<BackendDemand[]>(`${this.baseUrl}demands/`)
          .pipe(map((rows) => rows.map((row) => this.adaptDemand(row, sparesById.get(row.spare), maps)))),
      ),
    );
  }

  getDemandEntry(id: string): Observable<DemandEntry | undefined> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http
          .get<BackendDemand>(`${this.baseUrl}demands/${id}/`)
          .pipe(map((row) => this.adaptDemand(row, sparesById.get(row.spare), maps))),
      ),
    );
  }

  submitDemandDetails(id: string, payload: DemandDetailsPayload): Observable<void> {
    return this.http
      .post(`${this.baseUrl}demands/${id}/complete/`, {
        quantity_demanded: payload.quantityDemanded,
        demand_number: payload.demandNumber,
        demand_date: payload.demandDate,
        remarks: payload.remarks,
      })
      .pipe(map(() => void 0));
  }

  /** BACKEND GAP: `DemandViewSet.raise_dart` — same retirement as `raiseDartForSurvey` above,
   * scoped to Demand rows: it now unconditionally raises `RAISE_DART_RETIRED_MESSAGE` on the
   * restructured obs backend. */
  raiseDartForDemand(ids: string[]): Observable<void> {
    return this.http
      .post(`${this.baseUrl}demands/raise-dart/`, { ids: ids.map(Number) })
      .pipe(map(() => void 0));
  }

  /** Always promotes into the Demand cart — `payload.cartType` is a required field on
   * `SendToCartPayload` the demand-list caller has no real use for (Demand has no Survey/PTS
   * choice), so it's ignored here rather than trusted. */
  sendDemandToCart(payload: SendToCartPayload): Observable<{ totalCount: number; unmatchedCount: number }> {
    return this.sendToObsCart(payload, "Demand");
  }

  // ---------------------------------------------------------------------------------------
  // Internal Transactions — Items Identified as Faulty / Not-Catted (IIF)
  // ---------------------------------------------------------------------------------------

  getIifList(): Observable<IifEntry[]> {
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendNotInCattedItem[]>(`${this.baseUrl}not-in-catted-items/pending/`).pipe(
          map((rows) => {
            this.iifSpareByEntryId.clear();
            return rows.map((row) => {
              if (row.spare_id != null) this.iifSpareByEntryId.set(String(row.id), String(row.spare_id));
              const spareRow = row.spare_id != null ? sparesById.get(row.spare_id) : undefined;
              const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
              const entry: IifEntry = {
                id: String(row.id),
                patternNumber: spare?.patternNumber ?? "",
                description: spare?.description ?? "",
                quantity: spare?.quantityAvailable ?? 0,
                category: spare?.category ?? "",
                equipmentClass: spare?.equipmentClass ?? "",
                critical: spare?.critical ?? false,
                authority: spare?.authority ?? "",
                parentInventory: "ILMS",
              };
              return entry;
            });
          }),
        ),
      ),
    );
  }

  /** Fired on Pattern Number blur by `spare-form.ts`'s async validator — a background check, not
   * a user-triggered save, so it must not surface the generic interceptor success toast (that
   * toast was appearing while the rest of the Add Spare form was still invalid, reading as
   * "success" next to a red required-field error). */
  verifyPatternNumber(_id: string, patternNumber: string): Observable<VerifyPatternResult> {
    return this.http
      .post<BackendVerifyPatternResult>(
        `${this.baseUrl}spares/verify-pattern/`,
        { pattern_number: patternNumber },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(
        // The five keys this adapter used to drop are kept. Nothing
        // renders them yet and no existing caller reads them — `spare-form.ts` and
        // `iif-list.ts` both use `matched` alone — so this changes no screen. It stops the
        // information being thrown away at the door, which is what the import's
        // source-of-truth correction needs in order to say which source corrected a value.
        map((result) => ({
          matched: result.valid,
          itemCode: result.item_code,
          description: result.description ?? result.item_desc,
          category: result.category,
          source: result.source as VerifyPatternSource | undefined,
          crpCategory: result.crp_category,
          expectedCategory: result.expected_category,
          categoryMismatch: result.category_mismatch,
          denomination: result.denomination,
        })),
      );
  }

  updateIifPatternNumber(id: string, patternNumber: string): Observable<void> {
    const sparePk = this.iifSpareByEntryId.get(id);
    if (!sparePk) {
      return throwError(
        () => new Error("Unable to resolve the spare for this IIF entry — reload the list and try again."),
      );
    }
    return this.http
      .post(`${this.baseUrl}spares/update-pattern/`, {
        spare_pk: Number(sparePk),
        pattern_number: patternNumber,
      })
      .pipe(map(() => void 0));
  }

  sendIifToCart(payload: SendToCartPayload): Observable<void> {
    // obs has no dedicated MO/WED "cart" endpoint; mark-incatted is the closest real action and
    // produces the visible effect this screen wants (the item leaves the pending IIF list).
    return forkJoin(
      payload.ids.map((id) =>
        this.http.post(`${this.baseUrl}not-in-catted-items/${id}/mark-incatted/`, {}),
      ),
    ).pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // References — Masters (Import Data / Upload PIL)
  // ---------------------------------------------------------------------------------------

  /** `GET download-template/` (`SparesViewSet.download_template`) — the
   * curated onboard-spares import workbook for one department and one route, served straight off
   * disk by the back end. Not the generic header-only sheet the shared Excel mixin still builds
   * for every other viewset (compare `downloadVendorPilImportTemplate()` above, which is that
   * generic one for CPIL).
   *
   * `department` is the `master.Department` id. Sending it is what lets a privileged login pick a
   * department at all — a departmental login is scoped to its own either way, and a request for
   * another department's template is refused by the back end rather than merely hidden here.
   * `subDepartment` is Executive-only and narrows the download to the Hull or NBCD workbook.
   *
   * `skipFeedback` on the toast: a "not yet available" 404 for a department whose workbook has
   * not been authored is a normal, expected answer that the caller words for itself, not a
   * transport failure worth an interceptor toast. */
  downloadSparesImportTemplate(
    departmentId: string,
    route: "D787J" | "OTHERS",
    subDepartment?: string,
  ): Observable<Blob> {
    return this.http.get(`${this.baseUrl}spares/download-template/`, {
      params: this.toParams({ department: departmentId, route, sub_department: subDepartment }),
      responseType: "blob",
      context: skipFeedback({ toast: true }),
    });
  }

  /** `GET template-routes/` (`SparesViewSet.import_template_routes`) —
   * which template workbooks exist for this scope, so the page offers only the Download Template
   * button that can succeed.
   *
   * The two buttons used to be shown to everyone and one of them 404'd: NBCD holds its spares on
   * CNAL alone and has never had a D787J workbook, and Logistics, Medical and Executive-at-large
   * hold no D787J document either (rules clause 2.5.1 names Engineering, Electrical and Hull).
   * Asking first is error PREVENTION rather than error reporting.
   *
   * `subDepartment` is the workbook CODE (`"HULL"`), matching `downloadSparesImportTemplate`'s
   * argument of the same name and NOT `ImportSelection.subDepartment`, which is a row id. */
  getImportTemplateRoutes(
    departmentId?: string,
    subDepartment?: string,
  ): Observable<ImportTemplateRoutes> {
    return this.http.get<ImportTemplateRoutes>(`${this.baseUrl}spares/template-routes/`, {
      params: this.toParams({ department: departmentId, sub_department: subDepartment }),
    });
  }

  /** `GET import-ship-customer-code/` — the ship's adopted MO customer code.
   *
   * Read before anything is imported, so the one number an operator needs in order to prepare a
   * workbook is on the screen rather than only inside a refusal they have to trigger first.
   *
   * Deliberately NOT cached, for the same reason `getImportAuthorities` is not: it changes the
   * moment the first workbook is committed, and a cached "not yet adopted" would leave the panel
   * lying for the rest of the session. */
  getShipCustomerCodeState(): Observable<ShipCustomerCodeState> {
    return this.http
      .get<ShipCustomerCodeStateRawResponse>(`${this.baseUrl}spares/import-ship-customer-code/`, {
        context: skipFeedback({ toast: true }),
      })
      .pipe(map(adaptShipCustomerCodeState));
  }

  /** `DELETE import-ship-customer-code/` — forget the adopted code so the next import re-adopts
   * from its own workbook. Administrator only, refused with 403 for everyone else. Idempotent:
   * clearing an already-blank code is a 200 saying nothing was cleared, not an error. */
  clearShipCustomerCode(): Observable<ShipCustomerCodeState> {
    return this.http
      .delete<ShipCustomerCodeStateRawResponse>(`${this.baseUrl}spares/import-ship-customer-code/`)
      .pipe(map(adaptShipCustomerCodeState));
  }

  /** `GET spares/purge-state/` — the scope and the live count behind the
   * Clear OBS Spares control.
   *
   * A caller who may not clear anything is refused with 403 by `CanPurgeSpares` rather than being
   * answered `can_purge: false`, so the page treats a failure here as "no control" and shows
   * nothing. `skipFeedback` on the toast is what stops that ordinary, expected 403 from raising an
   * error toast on a screen the user is allowed to be on. */
  getSparesPurgeState(): Observable<SparesPurgeState> {
    return this.http
      .get<SparesPurgeStateRawResponse>(`${this.baseUrl}spares/purge-state/`, {
        context: skipFeedback({ toast: true }),
      })
      .pipe(
        map((response) => ({
          canPurge: response.can_purge,
          scope: response.scope,
          departmentName: response.department_name,
          spareCount: response.spare_count,
        })),
      );
  }

  /** `POST spares/purge/` — deletes every spare in this caller's scope together with the issue,
   * survey, demand and receipt records hanging off them.
   *
   * `confirm` is a typed phrase the back end checks (`PURGE_CONFIRMATION_PHRASE`), following
   * `users.views.DatabaseResetAPIView`, which is this codebase's own precedent for a destructive
   * endpoint. A wrong phrase is a 400 that has deleted nothing. */
  purgeSpares(confirm: string): Observable<SparesPurgeResult> {
    return this.http.post<SparesPurgeResult>(`${this.baseUrl}spares/purge/`, { confirm });
  }

  /** `POST import-excel-preview/` (`SparesViewSet.import_excel_preview`) — never mutates data
   * (server-side rolled back). Returns a full per-row data preview (every importable field, not
   * just error rows), a status per row (`valid`/`invalid`/`duplicate`), and file-level column
   * classification (missing essential/optional columns, extra/ignored ones). Always resolves
   * normally for a parseable file — row problems are normal output, not a transport error. */
  previewImportExcel(
    file: File,
    selection: ImportSelection,
    workingTable?: ImportWorkingTable,
    background = false,
  ): Observable<ExcelImportPreview> {
    const formData = this.toImportFormData(file, selection, workingTable);
    return this.postImportPreview(formData, background);
  }

  /** Requirement 3.3's HAND-ENTRY mode, on the endpoint the workbook
   * already uses. `rows` goes in place of `file` and everything else is identical - the same
   * URL, the same four gates, the same rule engine, the same response shape. A hand-built row
   * is validated identically to an imported one because by the time the server looks at it,
   * it is one.
   *
   * `submit-validated-inventory-data/` was evaluated as the nearest existing row-accepting
   * endpoint and is NOT used: it runs none of the rule engine, requires a pattern number
   * clause 2.7.1 permits to be blank, still mints master rows, and returns no per-row status,
   * so it cannot drive a working table. No third endpoint was written either. */
  previewManualRows(
    rows: ImportManualRow[],
    selection: ImportSelection,
    background = false,
  ): Observable<ExcelImportPreview> {
    return this.postImportPreview(this.toManualImportFormData(rows, selection), background);
  }

  /** `background` is the re-check the working table runs BY ITSELF after a cell is corrected,
   * as opposed to one the operator asked for with the button.
   *
   * It suppresses the full-screen loader as well as the toast. The loader is right for a check
   * somebody pressed a button and is waiting on; it is wrong for one that fires every time a
   * rating tabs out of a cell, where it would grey the screen out from under the table they are
   * reading. The toast was already suppressed on both. Errors still reach the caller either way -
   * `masters-page` puts them in the panel above the table, which does not disappear. */
  private postImportPreview(
    formData: FormData,
    background = false,
  ): Observable<ExcelImportPreview> {
    return this.http
      .post<ExcelImportPreviewRawResponse>(`${this.baseUrl}spares/import-excel-preview/`, formData, {
        context: skipFeedback({ toast: true, loader: background }),
      })
      .pipe(
        map((response) => adaptExcelImportPreview(response)),
        catchError((error: unknown) => throwError(() => new Error(describeExcelPreviewError(error)))),
      );
  }

  /** `POST import-excel-commit-valid/` (`SparesViewSet.import_excel_commit_valid`) — commits
   * only the rows a preview would classify "valid"; invalid/duplicate rows are skipped
   * individually rather than blocking the whole batch. Stateless: re-parses and re-validates the
   * re-uploaded file itself rather than trusting any previously-fetched preview. */
  commitValidImportExcel(
    file: File,
    selection: ImportSelection,
    workingTable?: ImportWorkingTable,
  ): Observable<ExcelImportCommitResult> {
    return this.postImportCommit(this.toImportFormData(file, selection, workingTable));
  }

  /** The hand-entry half of Save. Same endpoint, same gates, same
   * re-validation from scratch before a single row is written — see `previewManualRows`. */
  commitValidManualRows(
    rows: ImportManualRow[],
    selection: ImportSelection,
    confirmedMasterAdditions?: { field: string; value: string }[],
  ): Observable<ExcelImportCommitResult> {
    return this.postImportCommit(
      this.toManualImportFormData(rows, selection, confirmedMasterAdditions),
    );
  }

  private postImportCommit(formData: FormData): Observable<ExcelImportCommitResult> {
    return this.http
      .post<ExcelImportCommitRawResponse>(`${this.baseUrl}spares/import-excel-commit-valid/`, formData, {
        context: skipFeedback({ toast: true }),
      })
      .pipe(
        map((response) => adaptExcelImportCommit(response)),
        catchError((error: unknown) => throwError(() => new Error(describeExcelPreviewError(error)))),
      );
  }

  /** `GET import-value-lists/` (`SparesViewSet.import_value_lists`) — every
   * closed list a hand-entered row may draw on, for the caller's own department and one route.
   *
   * Fetched per route rather than cached with the other master lists: it is a permitted-value
   * answer that depends on the route the operator picked, and the D787J and OTHERS routes give
   * different spare classes. Nothing here is hard-coded in the component — that is the whole
   * point of the endpoint, because a value list living in a template drifts from the rule
   * engine and then offers a value the engine refuses. */
  getImportValueLists(route: ImportRoute, departmentId?: string): Observable<ImportValueLists> {
    return this.http
      .get<ImportValueListsRawResponse>(`${this.baseUrl}spares/import-value-lists/`, {
        // `department` joins `route`. The lists are per department and per
        // route, and the department is now chosen on the form rather than taken from the caller's
        // profile — so an admin building rows on behalf of Engineering is offered Engineering's
        // spare classes and denominations, not an empty list.
        params: this.toParams({ route, department: departmentId }),
      })
      .pipe(
        map((response) => ({
          route: response.route,
          department: response.department,
          spareClasses: response.spare_classes,
          spareClassesNotSetUp: response.spare_classes_not_set_up,
          equipmentClasses: response.equipment_classes,
          equipmentClassOptions: response.equipment_class_options ?? {},
          categories: response.categories,
          denominations: response.denominations,
          rackPositions: response.rack_positions,
          criticalValues: response.critical_values,
        })),
      );
  }

  /** The one place the import multipart body is built, so the preview and
   * the commit cannot disagree about it. The back end re-checks all four on both calls — it
   * remembers nothing between them, deliberately, because the file may have changed since the
   * preview and a client must not be able to force-commit a selection the server would refuse. */
  private toImportFormData(
    file: File,
    selection: ImportSelection,
    workingTable?: ImportWorkingTable,
  ): FormData {
    const formData = new FormData();
    formData.append("file", file);
    this.appendImportSelection(formData, selection);
    // The working table's corrections travel with the file on BOTH
    // calls, because both endpoints re-read the workbook from scratch and remember nothing
    // between them. Omitted entirely when there are none, so a first preview sends exactly
    // the body it always sent. What goes on the wire is cell values, never a row's verdict
    // - the server re-validates every one of them.
    if (workingTable && Object.keys(workingTable.edits).length) {
      formData.append("edits", JSON.stringify(workingTable.edits));
    }
    if (workingTable && workingTable.removedRows.length) {
      formData.append("removed_rows", JSON.stringify(workingTable.removedRows));
    }
    if (workingTable?.confirmedMasterAdditions?.length) {
      formData.append(
        "confirmed_master_additions",
        JSON.stringify(workingTable.confirmedMasterAdditions),
      );
    }
    return formData;
  }

  /** The hand-entry body — the same three selection fields, and `rows`
   * where the workbook body carries `file`. Built beside `toImportFormData` above so the two
   * modes cannot drift on the fields they share.
   *
   * `edits` and `removed_rows` are deliberately absent. They exist because a workbook is
   * re-read from disk on every call and a correction to it lives only in the browser. A
   * hand-built row has no sheet behind it — the client holds the rows themselves, so an edit
   * changes the row that is posted rather than overlaying a correction on top of one. */
  private toManualImportFormData(
    rows: ImportManualRow[],
    selection: ImportSelection,
    confirmedMasterAdditions?: { field: string; value: string }[],
  ): FormData {
    const formData = new FormData();
    formData.append("rows", JSON.stringify(rows));
    this.appendImportSelection(formData, selection);
    // the ONE field the hand-entry body shares with `edits` and
    // `removed_rows`, and it is here rather than absent because a hand-built row reaches the
    // same rule engine and can introduce the same new master value. Sent on the commit only.
    if (confirmedMasterAdditions?.length) {
      formData.append("confirmed_master_additions", JSON.stringify(confirmedMasterAdditions));
    }
    return formData;
  }

  /** The selection fields both bodies carry, written once so the workbook
   * path and the hand-entry path cannot drift on them — which is exactly what would have happened
   * when `department` and `subDepartment` were added to a five-line block that existed twice.
   *
   * `sub_department` is omitted entirely when there is none, rather than sent empty: the back end
   * reads its absence as "this sheet is not attributed to a sub-department", which is the correct
   * and normal answer for every non-Executive department. */
  private appendImportSelection(formData: FormData, selection: ImportSelection): void {
    formData.append("department", selection.department);
    if (selection.subDepartment) {
      formData.append("sub_department", selection.subDepartment);
    }
    formData.append("route", selection.route);
    formData.append("authority", selection.authority);
    formData.append("password", selection.password);
  }

  /** `GET import-authorities/` (`SparesViewSet.import_authorities`) — the
   * Import Authority values THIS caller may select, in the order to offer them.
   *
   * Not `getAuthorities()` above, and not part of `master_dropdown`. `authorities/` returns the
   * Authority master table, every row of it, unscoped — including any junk row an earlier
   * unguarded import created. This returns clause 2.17's permitted-value list, narrowed to the
   * caller's role and department: `D787J` appears only for an entitled login, and a department
   * whose workbook locks the column further (NBCD, to CNAL) gets only what it is allowed.
   *
   * Deliberately NOT cached. Every other master list on this service is cached for the app
   * session with `cachedUntilError()`, which is right for reference data and wrong for a
   * permission answer — this one must be re-asked, not remembered. */
  getImportAuthorities(departmentId?: string): Observable<ImportAuthorityList> {
    return this.http
      .get<ImportAuthorityListRawResponse>(`${this.baseUrl}spares/import-authorities/`, {
        // Scoped to the CHOSEN department rather than the caller's own, for
        // the same reason `getImportValueLists` is. Clause 2.17's permitted authorities differ by
        // department — NBCD's workbook locks the column to CNAL — so an admin importing on behalf
        // of a department must be offered that department's authorities.
        params: this.toParams({ department: departmentId }),
      })
      .pipe(
        map((response) => ({
          canImportD787j: response.can_import_d787j,
          authorities: response.authorities,
        })),
      );
  }

  /** `GET equipment_class/department-master/` — one department's spare
   * classes, each carrying its own equipment classes, for the Equipment Classes tab.
   *
   * One call and not two. The tab renders the equipment classes GROUPED BY the spare class they
   * hang under, so the spare classes are the grouping key rather than an independent list, and
   * asking for them separately would only let the two answers disagree between requests.
   *
   * Not `getEquipmentClasses()` above, which is the whole unscoped table cached for the session
   * and feeds `masterMaps$`'s name lookups. This is a scoped answer that CHANGES the moment the
   * tab adds a class, so it is deliberately NOT cached with `cachedUntilError()` — a cached list
   * would leave the tab showing a class list that no longer matches what the server holds. */
  getDepartmentEquipmentClasses(departmentId?: string): Observable<DepartmentEquipmentClasses> {
    return this.http
      .get<DepartmentEquipmentClassesRawResponse>(
        `${this.baseUrl}equipment_class/department-master/`,
        { params: this.toParams({ department: departmentId }) },
      )
      .pipe(
        map((response) => ({
          department: response.department == null ? "" : String(response.department),
          departmentName: response.department_name,
          locked: response.locked,
          canAdd: response.can_add,
          spareClasses: response.spare_classes.map((spareClass) => ({
            id: String(spareClass.id),
            name: spareClass.name,
            equipmentClasses: spareClass.equipment_classes.map((entry) => ({
              id: String(entry.id),
              name: entry.name,
            })),
          })),
          spareClassesNotSetUp: response.spare_classes_not_set_up,
        })),
      );
  }

  /** `POST miscellaneous/` with `type=equipment_class` — adds one
   * equipment class under an EXISTING spare class.
   *
   * The endpoint already existed and already created all four onboard-spares master-data types
   * by type (`MiscellaneousMasterDataView`), so this reuses it rather than adding a fifth
   * create route that would have to be kept in step with it.
   *
   * `type` is `equipment_class` and NOTHING IN THIS SERVICE EVER POSTS `spare_class`. The spare
   * class list is fixed by the rules document, the tab renders it read only, and
   * `manage.py seed_equipment_class_defaults` is the only path that creates one.
   *
   * `skipFeedback({ toast: true })` for the same reason `createSpareDataMapping` above uses it:
   * a duplicate name has to be reported AT THE FIELD, and the interceptor's generic error toast
   * would put the same sentence somewhere the operator cannot act on it. The page raises its own
   * success toast and writes the failure under the name field. */
  createEquipmentClass(name: string, spareClassId: string): Observable<void> {
    return this.http
      .post(
        `${this.baseUrl}miscellaneous/`,
        {
          type: "equipment_class",
          name,
          spare_class: Number(spareClassId),
        },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(map(() => void 0));
  }

  /** `SparesMapping.equipment` FKs `sfd.ShipEquipment`, not anything in `obs` — reused here
   * (a cross-app read, same pattern as the Upload CPIL import above reaching into `ilms`) for the
   * References > Masters > Spare Data Map "INSMA Equipment Name" picker. `sfd`'s
   * `transaction-equipment/list/` action already
   * department/role-scopes the result server-side, same as everywhere else in the app. */
  getShipEquipmentOptions(): Observable<DropdownOptionDto[]> {
    return this.http
      .get<{ status: string; equipments: { id: number; nomenclature: string }[] }>(
        `${resolveCmmsApiUrl()}api/v1/sfd/transaction-equipment/list/`,
      )
      .pipe(
        map((response) =>
          response.equipments.map((row) => ({ value: String(row.id), label: row.nomenclature })),
        ),
      );
  }

  /** References > Masters > Spare Data Map. `SparesMapping` (`spares-mapping/`) already has a
   * plain working CRUD endpoint — this was never a backend gap, only the equipment picker above
   * was missing. One call creates one mapping row (equipment <-> one equipment class); `section`
   * is left unset since the model has it as optional metadata, not required for the mapping to
   * mean anything. Uses `skipFeedback({ toast: true })` since `masters-page.ts` already shows its
   * own "Spare Data Map saved." toast on success — without this, the interceptor's generic toast
   * would double up with it. */
  createSpareDataMapping(equipmentId: string, equipmentClassId: string): Observable<void> {
    return this.http
      .post(
        `${this.baseUrl}spares-mappings/`,
        {
          equipment: Number(equipmentId),
          equipment_class: Number(equipmentClassId),
        },
        { context: skipFeedback({ toast: true }) },
      )
      .pipe(map(() => void 0));
  }

  // ---------------------------------------------------------------------------------------
  // References > Masters > Upload CPIL — `ilms.VendorPilViewSet`'s `ExcelImportExportMixin`
  // (`api/v1/ilms/vendor-pils/import-excel/`), same shared mixin/contract as MO/WED's masters
  // "Import Data" tabs (`MoApiService.importExcel()`/`WedApiService.importExcel()`).
  // ---------------------------------------------------------------------------------------

  /** `POST ilms/vendor-pils/import-excel/`. All-or-nothing per file — a single invalid row
   * rejects the whole batch. Dispatches to Celery when a worker is available (`status:
   * "accepted"` + poll `task_status_url`); resolves inline otherwise, which is the common path in
   * dev. `dryRun` validates without saving. */
  importVendorPilExcel(file: File, dryRun: boolean): Observable<VendorPilImportResult> {
    const formData = new FormData();
    formData.append("file", file);
    if (dryRun) formData.append("dry_run", "1");
    return this.http
      .post<BackendVendorPilImportEnvelope>(
        `${resolveCmmsApiUrl()}api/v1/ilms/vendor-pils/import-excel/`,
        formData,
        { context: skipFeedback({ loader: true, toast: true }) },
      )
      .pipe(
        switchMap((response) => this.resolveVendorPilImportEnvelope(response)),
        catchError((error: unknown) => this.resolveVendorPilImportError(error)),
      );
  }

  /** `GET ilms/vendor-pils/download-template/` — header-only `.xlsx` of the importable columns. */
  downloadVendorPilImportTemplate(): Observable<Blob> {
    return this.http.get(`${resolveCmmsApiUrl()}api/v1/ilms/vendor-pils/download-template/`, {
      responseType: "blob",
    });
  }

  private resolveVendorPilImportEnvelope(
    response: BackendVendorPilImportEnvelope,
  ): Observable<VendorPilImportResult> {
    if (response.status === "accepted" && response.task_status_url) {
      return this.pollVendorPilImportTask(response.task_status_url, 0);
    }
    return of(this.adaptVendorPilImportEnvelope(response));
  }

  private pollVendorPilImportTask(taskStatusUrl: string, attempt: number): Observable<VendorPilImportResult> {
    if (attempt >= 20) {
      return throwError(
        () => new Error("Import is taking longer than expected. Check back shortly and try again."),
      );
    }
    return timer(1500).pipe(
      switchMap(() =>
        this.http.get<BackendVendorPilImportTaskStatus>(this.absoluteImportUrl(taskStatusUrl)),
      ),
      switchMap((statusRes) => {
        const status = (statusRes.status || "").toUpperCase();
        if (status === "FAILURE") {
          return throwError(() => new Error("Import failed."));
        }
        if (statusRes.result) {
          return of(this.adaptVendorPilImportEnvelope(statusRes.result));
        }
        return this.pollVendorPilImportTask(taskStatusUrl, attempt + 1);
      }),
    );
  }

  private adaptVendorPilImportEnvelope(response: BackendVendorPilImportEnvelope): VendorPilImportResult {
    const errors = (response.errors ?? []).map(
      (row): VendorPilImportRowError => ({ row: row.row, errors: row.errors }),
    );
    return {
      status: response.dry_run ? "dry_run" : "imported",
      imported: response.imported ?? 0,
      validRows: response.dry_run ? (response.valid_rows ?? 0) : (response.imported ?? 0),
      invalidRows: response.invalid_rows ?? 0,
      errors,
      headerErrors: [],
      allowedColumns: [],
    };
  }

  /** `import_excel` rejects a whole file with three different 400 shapes (unsupported columns,
   * too many rows, or row-validation failures) — resolved into a `VendorPilImportResult` here
   * (not re-thrown) so the caller can render all three the same way it renders success. A
   * genuinely unexpected error shape (network/500) still propagates. */
  private resolveVendorPilImportError(error: unknown): Observable<VendorPilImportResult> {
    if (!(error instanceof HttpErrorResponse) || typeof error.error !== "object" || error.error === null) {
      return throwError(() => error);
    }
    const body = error.error as BackendVendorPilImportEnvelope;
    if (Array.isArray(body.headers)) {
      return of({
        status: "column_error",
        imported: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [],
        headerErrors: body.headers,
        allowedColumns: body.allowed_columns ?? [],
      });
    }
    if (Array.isArray(body.file)) {
      return of({
        status: "row_limit_error",
        imported: 0,
        validRows: 0,
        invalidRows: 0,
        errors: [],
        headerErrors: body.file,
        allowedColumns: [],
      });
    }
    if (Array.isArray(body.errors)) {
      return of(this.adaptVendorPilImportEnvelope(body));
    }
    return throwError(() => error);
  }

  private absoluteImportUrl(url: string): string {
    if (url.startsWith("http")) return url;
    const apiBase = resolveCmmsApiUrl().replace(/\/$/, "");
    return `${apiBase}${url.startsWith("/") ? "" : "/"}${url}`;
  }

  // ---------------------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------------------

  /** BACKEND GAP: `history_search/` unconditionally 500s — `select_related("user_profile")`
   * in the Django view references a field that doesn't exist on that model (confirmed via the
   * live error body: "Invalid field name(s) given in select_related: 'user_profile'. Choices
   * are: rank, designation_master, department, role_master, command_name, ship, division").
   * Sourced from `sparesissued_tomaintainers/` + `sparesissued_ontyloan/` instead — the same two
   * real, working endpoints the "Spares Issued to Maintainers" / "Spares Issued on Ty Loan"
   * dashboard drill-downs already use — mirroring how `getReturnedHistory()` below already
   * bypasses `history_search/`'s equally-unusable `history_return` rows in favor of
   * `sparesreturned/`. */
  getIssuedHistory(filters: HistoryFilters): Observable<HistoryEntry[]> {
    return forkJoin({
      toMaintainers: this.getSparesIssuedToMaintainers(),
      tyLoan: this.getSparesIssuedOnTyLoan(),
    }).pipe(
      map(({ toMaintainers, tyLoan }) =>
        [...toMaintainers, ...tyLoan]
          .map(
            (entry): HistoryEntry => ({
              id: entry.issuePk,
              patternNumber: entry.patternNumber,
              description: entry.description,
              date: entry.issueDate,
              quantity: entry.issuedQty,
              user: entry.username,
              equipmentClass: entry.equipmentClass,
              authority: entry.authority,
              reason: entry.reason,
              equipmentNomenclature: entry.equipmentNomenclature,
            }),
          )
          .filter((entry) => this.matchesHistoryFilters(entry, filters)),
      ),
    );
  }

  getReturnedHistory(filters: HistoryFilters): Observable<HistoryEntry[]> {
    // The `history_search/` action's `history_return` rows carry no date/quantity, so returned
    // history is sourced from `returns/returned-spares/` (Return records) instead, which has
    // both — joined against `sparesById$`/`masterMaps$` for equipment class + authority the same
    // way the pending returns list (`getReturnList`) already does.
    return combineLatest([this.masterMaps$, this.sparesById$]).pipe(
      switchMap(([maps, sparesById]) =>
        this.http.get<BackendReturn[]>(`${this.baseUrl}returns/returned-spares/`).pipe(
          map((rows) =>
            rows
              .map((row) => this.adaptReturnToHistoryEntry(row, sparesById, maps))
              .filter((entry) => this.matchesHistoryFilters(entry, filters)),
          ),
        ),
      ),
    );
  }

  /** Equipment class name -> spare class name, derived from the same cached master lookups used
   * everywhere else in this service — lets History filter by Spare Class even though the history
   * rows themselves only carry an equipment class name. */
  getEquipmentClassToSpareClass(): Observable<Map<string, string>> {
    return this.masterMaps$.pipe(
      map((maps) => {
        const result = new Map<string, string>();
        for (const { name, spareClassId } of maps.equipmentClassById.values()) {
          const spareClassName = maps.spareClassNameById.get(spareClassId);
          if (spareClassName) result.set(name, spareClassName);
        }
        return result;
      }),
    );
  }

  private matchesHistoryFilters(entry: HistoryEntry, filters: HistoryFilters): boolean {
    if (!this.withinDateRange(entry.date, filters)) return false;
    if (filters.equipmentClass && entry.equipmentClass !== filters.equipmentClass) return false;
    return true;
  }

  // ---------------------------------------------------------------------------------------
  // Adapters — backend snake_case/id-only DTOs -> UI camelCase DTOs
  // ---------------------------------------------------------------------------------------

  private adaptSpare(row: BackendSpare, maps: ObsMasterMaps): Spare {
    const equipmentClass = maps.equipmentClassById.get(row.equipment_class);
    const spareClassName = equipmentClass
      ? maps.spareClassNameById.get(equipmentClass.spareClassId)
      : undefined;
    const departmentId = equipmentClass
      ? maps.departmentIdBySpareClassId.get(equipmentClass.spareClassId)
      : undefined;
    return {
      id: String(row.id),
      departmentId: departmentId != null ? String(departmentId) : undefined,
      departmentName: departmentId != null ? maps.departmentNameById.get(departmentId) : undefined,
      spareClass: spareClassName ?? "",
      equipmentClass: equipmentClass?.name ?? String(row.equipment_class),
      patternNumber: row.pattern_number,
      description: row.description,
      compartment: row.compartment ?? "",
      rackPosition: row.rack_position ?? "",
      rackNumber: row.rack_number ?? "",
      location: row.location ?? "",
      category: (row.category || "PERMANENT") as SpareCategory,
      critical: row.critical,
      criticalityStrength: (row.criticality_strength || "NONE") as CriticalityStrength,
      denomination:
        row.denomination != null ? maps.denominationNameById.get(row.denomination) ?? "" : "",
      authority: maps.authorityNameById.get(row.authority) ?? String(row.authority),
      quantityAuthorised: row.quantity_authorised,
      quantityAvailable: row.quantity_available,
      // Carried through as-is rather than recomputed here, so the shortfall the grid shows,
      // the exports carry and the tile counts is the one the server derived. Stays undefined
      // for every endpoint that doesn't send it.
      deficiencyQuantity: row.deficiency_quantity,
      page: row.page ?? "",
      line: row.line ?? "",
      remarks: row.remarks ?? "",
      // DRF serializes ImageField as an absolute URL when request context is present, which
      // CleanValidationModelViewSet always provides — no origin-prefixing needed here.
      // A spare that never had a photograph uploaded still carries the model default
      // `obs/default.png`, and `SparesSerializer` sends that path through as a real URL. Read
      // straight, every such spare looked photographed: the detail page captioned the shared
      // placeholder "Spare photograph", and the Update form had nothing to tell the operator
      // the row still needs one. Resolved once here rather than on each screen, because
      // `adaptSpare` is the single door every spare enters the UI through.
      imageUrl: isPlaceholderSpareImage(row.image) ? undefined : row.image ?? undefined,
    };
  }

  private adaptIssueToListEntry(
    issue: BackendIssue,
    spareRow: BackendSpare | undefined,
    maps: ObsMasterMaps,
    issuePk: number,
    /** Profile id -> person, from `inventoryUsers$`. Optional because the dashboard lists that
     * share this adapter don't fetch it; without it the row keeps the raw id it always
     * showed and simply carries no unit. */
    usersById?: Map<string, ObsUserOption>,
    /** `IssueList.quantity_toreturn` — what is still owed. Optional for the same reason: the
     * dashboard lists are built from `Issue` rows that have no pending-return row at all, so
     * for them the outstanding quantity is simply the issued quantity. */
    outstandingQty?: number,
  ): IssueListEntry {
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    const holder = usersById?.get(String(issue.username));
    const remarksTyLoan = issue.remarks?.toUpperCase() === "TY LOAN";
    // A row is a Ty Loan either because it was issued as one, or because the person holding
    // it belongs to a unit other than the ship recorded in masters — `is_own_unit` is decided
    // server-side (`onboard-spares/return-users/`), which is the only place that knows which
    // ship this installation is.
    const tyLoan = remarksTyLoan || (holder ? !holder.isOwnUnit : false);
    return {
      issuePk: String(issuePk),
      spareId: String(issue.spare),
      patternNumber: spare?.patternNumber ?? "",
      description: spare?.description ?? "",
      issueDate: issue.date_of_issue,
      // An import-recorded shortfall was issued to nobody. The Issue row
      // has to carry a user because `Issue.username` is non-nullable and the Return tab reads
      // `IssueList` joined to `Issue`, so it is recorded against the application admin - but
      // showing that account here would be a false statement about who holds the item. The
      // masked value says plainly what the row is instead.
      username: issue.is_import_shortfall
        ? IMPORT_SHORTFALL_ISSUED_TO
        : holder?.name || String(issue.username),
      issuedQty: issue.quantity_issued,
      authority: spare?.authority ?? "",
      reason: remarksTyLoan ? "Ty Loan - Other Ship" : "Defect",
      equipmentNomenclature: "", // ems.EquipmentName isn't exposed via the obs API
      equipmentClass: spare?.equipmentClass ?? "",
      spareClass: spare?.spareClass ?? "",
      category: spare?.category ?? "",
      denomination: spare?.denomination ?? "",
      critical: spare?.critical ?? false,
      isWedMo: false, // not exposed by IssueSerializer
      outstandingQty: outstandingQty ?? issue.quantity_issued,
      // "NA" for an internal issue, per the Return screen's own rule: the holder is on this
      // ship, so there is no other unit to name. For a Ty Loan the unit typed on the issue form
      // is the authority; the holder's own unit is the fallback for a row issued to somebody
      // from another ship without one being typed.
      // Developed with Understanding: a Ty Loan with a linked other-unit person now shows that
      // person's D5 label first, else the typed `issued_to_unit` exactly as before - a historic
      // Ty Loan has no linked person and no backfill (R2 Q12).
      unitName: tyLoan
        ? issue.issued_to_other_label || issue.issued_to_unit || holder?.unitName || ""
        : "NA",
      issueType: tyLoan ? "TY_LOAN" : "INTERNAL",
    };
  }

  private adaptRoutineRequisition(
    row: BackendRoutineRequisitionRow,
    spareRow: BackendSpare | undefined,
    maps: ObsMasterMaps,
  ): RequisitionEntry {
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    return {
      id: String(row.planned_spare_id),
      requestedFrom: "OBS",
      patternNumber: row.pattern_number,
      description: row.description || spare?.description || "",
      equipmentClass: spare?.equipmentClass ?? "",
      equipmentName: "",
      category: spare?.category ?? "",
      denomination: spare?.denomination ?? "",
      quantityAuthorised: spare?.quantityAuthorised ?? 0,
      quantityAvailable: row.quantity_available,
      quantityRequired: row.quantity_required,
      availableWithMo: row.available_onboard ? "Available Onboard" : "Requires MO/WED",
      status: row.available_onboard ? "HELD" : "NOT HELD",
      wedInventoryType: row.wed_inventory_type || "",
      critical: spare?.critical ?? false,
      authority: spare?.authority ?? "",
      boxNo: spare?.location ?? "",
      remarks: spare?.remarks ?? "",
      dartNumber: row.dart_number || undefined,
      routineName: row.routine_name || undefined,
      routineNo: row.routine_no || undefined,
      routineDescription: row.routine_description || undefined,
    };
  }

  private adaptDefectRequisition(
    row: BackendDefectRequisitionRow,
    spareRow: BackendSpare | undefined,
    maps: ObsMasterMaps,
  ): RequisitionEntry {
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    return {
      id: String(row.dart_spare_id),
      requestedFrom: "OBS",
      patternNumber: row.pattern_number,
      description: row.description || spare?.description || "",
      equipmentClass: spare?.equipmentClass ?? "",
      equipmentName: "",
      category: spare?.category ?? "",
      denomination: spare?.denomination ?? "",
      quantityAuthorised: spare?.quantityAuthorised ?? 0,
      quantityAvailable: row.quantity_available,
      quantityRequired: row.quantity_required,
      availableWithMo: row.available_onboard ? "Available Onboard" : "Requires MO/WED",
      status: row.available_onboard ? "HELD" : "NOT HELD",
      wedInventoryType: row.wed_inventory_type || "",
      critical: spare?.critical ?? false,
      authority: spare?.authority ?? "",
      boxNo: spare?.location ?? "",
      remarks: spare?.remarks ?? "",
      dartNumber: row.dart_number,
    };
  }

  // BACKEND GAP: see `returnSpare()` — `Return` has no "Same as Issued / New Item" column, so
  // this is captured client-side (localStorage) at submission time and re-attached here.
  private static readonly RETURN_ITEM_STATUS_KEY = "obs_return_item_status_v1";

  private setReturnItemStatus(returnId: number, status: ReturnedItemStatus): void {
    const map = this.readReturnItemStatusMap();
    map[returnId] = status;
    localStorage.setItem(ObsApiService.RETURN_ITEM_STATUS_KEY, JSON.stringify(map));
  }

  private readReturnItemStatusMap(): Record<number, ReturnedItemStatus> {
    try {
      const raw = localStorage.getItem(ObsApiService.RETURN_ITEM_STATUS_KEY);
      return raw ? (JSON.parse(raw) as Record<number, ReturnedItemStatus>) : {};
    } catch {
      return {};
    }
  }

  private adaptReturnToHistoryEntry(
    row: BackendReturn,
    sparesById: Map<number, BackendSpare>,
    maps: ObsMasterMaps,
  ): HistoryEntry {
    const spareRow = row.spare_id != null ? sparesById.get(row.spare_id) : undefined;
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    return {
      id: String(row.id),
      patternNumber: spare?.patternNumber ?? "",
      description: spare?.description ?? "",
      date: row.return_time ?? "",
      quantity: row.quantity_returned,
      user: row.username || "",
      equipmentClass: spare?.equipmentClass ?? "",
      authority: spare?.authority ?? "",
      remarks: row.remarks ?? "",
      returnedItemStatus: this.readReturnItemStatusMap()[row.id],
    };
  }

  /** The one place either queue screen's INcatting Status text is decided, so Due for Survey
   * and Due for Demand cannot label the same spare differently.
   *
   * "Not INcatted" wins over "IIF" because it is the stronger and more current statement: it
   * says an IIF record for this spare is open RIGHT NOW, whereas `is_iif` only records how the
   * queue row was created. The wording is the application's own — it is the second half of the
   * sidebar item the operator is sent to, "Due for IIF - Not INcatted Items". */
  private incattingStatusText(awaitingIncatting: boolean, isIif: boolean): string {
    if (awaitingIncatting) return "Not INcatted";
    return isIif ? "IIF" : "OK";
  }

  /** The DART No column's value, decided once for both queue screens.
   *
   * `initiate_dart_number` is preferred over the row's own `dart_number` because it is correct
   * in both cases where `dart_number` is correct in only one: it returns the row's own number
   * when the row carries a real one, and otherwise resolves the DART actually raised against
   * this spare's pattern number through `DartSpare`. A row whose DART was raised through the
   * maintainer's defect form therefore shows its number here immediately, instead of a blank
   * cell the operator has to interpret.
   *
   * The fall back to `dart_number` is kept for the case of a caller handing this adapter a
   * payload from before the field existed - it costs one `||` and removes a whole class of
   * blank-column bug report. */
  private resolveDartNumber(initiateDartNumber: string | null, dartNumber: string | null): string {
    return (initiateDartNumber ?? "").trim() || (dartNumber ?? "").trim();
  }

  /** Whether a resolved DART No means "this row has a DART".
   *
   * "pending" is the back end's own sentinel for "no DART found for this pattern"
   * (`_resolve_initiate_dart_number`, obs/serializers.py), so a blank test alone would read it
   * as a real number and offer Send to Cart on a row that cannot move. "none" and the em dash
   * are the two further sentinels the reference screens test for (R7 Section 6.1) - the two of
   * them test different sets, which is why this is one union used by both screens here. */
  private isDartPending(resolvedDartNumber: string): boolean {
    const normalised = resolvedDartNumber.trim().toLowerCase();
    return normalised === "" || normalised === "pending" || normalised === "none" || normalised === "—";
  }

  private adaptSurvey(
    row: BackendSurvey,
    spareRow: BackendSpare | undefined,
    maps: ObsMasterMaps,
  ): SurveyEntry {
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    // Resolved once and read twice below — the column shows it, and the row's action is chosen
    // from it. Computing it in one place is what stops the DART No cell and the row button
    // disagreeing about whether the row has a DART.
    const dartNumber = this.resolveDartNumber(row.initiate_dart_number, row.dart_number);
    // Read straight through — `SurveySerializer` emits the field on every row of both the list
    // and the detail payload, so it is declared non-optional on the DTO and needs no fallback.
    // The browser's copy is a convenience in any case: the server refuses the DART and the cart
    // send on its own reading, whatever this value says.
    const awaitingIncatting = row.awaiting_incatting;
    return {
      id: String(row.id),
      patternNumber: spare?.patternNumber ?? "",
      dartNumber,
      description: spare?.description ?? "",
      quantity: row.quantity_tosurvey,
      category: spare?.category ?? "",
      equipmentClass: spare?.equipmentClass ?? "",
      critical: spare?.critical ?? false,
      authority: spare?.authority ?? "",
      parentInventory: "ILMS", // Survey doesn't track an MO/WED source — obs has one merged queue
      incattingStatus: this.incattingStatusText(awaitingIncatting, row.is_iif),
      awaitingIncatting,
      hasDart: !this.isDartPending(dartNumber),
      // The spare's own primary key, kept alongside the Survey row's. `Raise DART` now hands
      // the selection to the single-DART form, and that form identifies each spare by the same
      // `pk` its own spare picker uses - which for an OBS spare is the `obs.Spares` key, not
      // the queue row's. It was already on the payload as `spare` and was being read only to
      // look the spare up.
      sparePk: String(row.spare),
    };
  }

  private adaptDemand(
    row: BackendDemand,
    spareRow: BackendSpare | undefined,
    maps: ObsMasterMaps,
  ): DemandEntry {
    const spare = spareRow ? this.adaptSpare(spareRow, maps) : null;
    // The Due for Demand half of the same gate — see `adaptSurvey`.
    const awaitingIncatting = row.awaiting_incatting;
    // The Due for Demand half of the resolved DART No — see `adaptSurvey`.
    const dartNumber = this.resolveDartNumber(row.initiate_dart_number, row.dart_number);
    return {
      id: String(row.id),
      patternNumber: spare?.patternNumber ?? "",
      description: spare?.description ?? "",
      quantity: row.quantity_todemand,
      category: spare?.category ?? "",
      equipmentClass: spare?.equipmentClass ?? "",
      critical: spare?.critical ?? false,
      authority: spare?.authority ?? "",
      parentInventory: "ILMS",
      incattingStatus: this.incattingStatusText(awaitingIncatting, row.is_iif),
      awaitingIncatting,
      dartNumber,
      hasDart: !this.isDartPending(dartNumber),
      // The Due for Demand half of the spare primary key — see `adaptSurvey`.
      sparePk: String(row.spare),
    };
  }

  // ---------------------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------------------

  private getSpareListAction(path: string): Observable<Spare[]> {
    return this.masterMaps$.pipe(
      switchMap((maps) =>
        this.http
          .get<BackendSpare[]>(`${this.baseUrl}${path}`)
          .pipe(map((rows) => rows.map((row) => this.adaptSpare(row, maps)))),
      ),
    );
  }

  /** `department`/`spareClass` on the payload are deliberately never appended —
   * both are pure UI cascade filters (see `SpareFormPayload`); `equipment_class`
   * alone already fully determines the row server-side (`equipment_class ->
   * spare_class -> department`), so sending them would just create a second,
   * unused source of truth. `patternNumber` may be `""` — the backend treats a
   * blank pattern number as "auto-generate one". */
  private buildSpareFormData(
    payload: SpareFormPayload,
    options?: { confirmDuplicateDescription?: boolean },
  ): FormData {
    const formData = new FormData();
    formData.append("equipment_class", payload.equipmentClass);
    formData.append("pattern_number", payload.patternNumber);
    formData.append("description", payload.description);
    formData.append("category", payload.category);
    formData.append("critical", String(payload.critical));
    formData.append("compartment", payload.compartment || "");
    formData.append("location", payload.location || "");
    formData.append("rack_position", payload.rackPosition || "");
    formData.append("rack_number", payload.rackNumber || "");
    formData.append("denomination", payload.denomination);
    formData.append("quantity_authorised", String(payload.quantityAuthorised));
    formData.append("quantity_available", String(payload.quantityAvailable));
    formData.append("authority", payload.authority);
    formData.append("page", payload.page || "");
    formData.append("line", payload.line || "");
    formData.append("remarks", payload.remarks || "");
    formData.append("is_obs", "true");
    if (payload.image) {
      formData.append("image", payload.image);
    }
    if (options?.confirmDuplicateDescription) {
      formData.append("confirm_duplicate_description", "true");
    }
    return formData;
  }

  private withinDateRange(date: string, filters: HistoryFilters): boolean {
    if (!date) return !filters.dateFrom && !filters.dateTo;
    const value = date.slice(0, 10);
    if (filters.dateFrom && value < filters.dateFrom) return false;
    if (filters.dateTo && value > filters.dateTo) return false;
    return true;
  }

  private lastSixMonthKeys(): string[] {
    const keys: string[] = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      keys.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
  }

  private monthLabel(key: string): string {
    const [year, month] = key.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  /** Counts how many ISO date strings fall in each "YYYY-MM" month key, in the given order. */
  private countByMonth(isoDates: (string | null)[], monthKeys: string[]): number[] {
    return monthKeys.map((key) => isoDates.filter((date) => !!date && date.slice(0, 7) === key).length);
  }

  private toOptionalId(value?: string): number | undefined {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toParams(query: Record<string, string | number | undefined | null>): HttpParams {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      params = params.set(key, String(value));
    }
    return params;
  }
}

/** `label` first, `name` as the fallback.
 *
 * Only the department lists carry a `label`, and only when the row's own name is not the
 * canonical department name — see `BackendLookup.label`. The `??` keeps every other caller of
 * this helper rendering exactly the name it rendered before. */
function toDropdownOptions(rows: BackendLookup[]): DropdownOptionDto[] {
  return rows.map((row) => ({ value: String(row.id), label: row.label ?? row.name }));
}

function adaptExistingSpareSummary(row: Record<string, unknown>): ExistingSpareSummary {
  return {
    id: String(row["id"]),
    patternNumber: String(row["pattern_number"] ?? ""),
    description: String(row["description"] ?? ""),
    equipmentClassName:
      row["equipment_class_name"] != null ? String(row["equipment_class_name"]) : undefined,
    spareClassName: row["spare_class_name"] != null ? String(row["spare_class_name"]) : undefined,
    quantityAuthorised: Number(row["quantity_authorised"] ?? 0),
    quantityAvailable: Number(row["quantity_available"] ?? 0),
    inUserDepartment: Boolean(row["in_user_department"]),
  };
}

/** Parses the two `409` conflict shapes `SparesViewSet.create()` can return
 * (`backend/obs/views.py`) into a typed `SpareConflict`. Returns `null` for any
 * other error so the caller falls through to the ordinary error path. */
export function parseSpareConflict(error: unknown): SpareConflict | null {
  if (!(error instanceof HttpErrorResponse) || error.status !== 409) return null;
  const body = error.error as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return null;

  if (body["code"] === "duplicate_pattern_number") {
    return {
      kind: "duplicate-pattern",
      message: String(body["detail"] ?? "This pattern number is already in use."),
      existing: adaptExistingSpareSummary(body["existing_spare"] as Record<string, unknown>),
    };
  }
  if (body["code"] === "duplicate_description") {
    const existingRows = (body["existing_spares"] as Record<string, unknown>[] | undefined) ?? [];
    return {
      kind: "duplicate-description",
      message: String(body["detail"] ?? "A spare with this description already exists."),
      existing: existingRows.map(adaptExistingSpareSummary),
    };
  }
  return null;
}

/** `addSpare()`'s catch-all for anything that isn't one of the two typed
 * conflicts above — the app's DRF exception handler wraps validation failures as
 * `{"status": "error", "message": "...", ...}` (confirmed live against
 * `SparesSerializer.validate()`'s >20-holding rule and the plain field errors). */
function describeSpareCreateError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
  const body = error.error as Record<string, unknown> | null;
  if (body && typeof body === "object" && typeof body["message"] === "string") {
    return body["message"];
  }
  if (error.status === 0) {
    return "Unable to reach the server. Please check your connection and try again.";
  }
  return "Could not save the spare. Please check the form and try again.";
}

/** Response shape of `ExcelImportExportMixin.import_excel` (`backend/obs/excel.py`,
 * shared verbatim by the `ilms` app's `VendorPilViewSet`) on success. */
/** Raw `import-excel-file/` response shape, shared by the dry-run and commit calls (`excel.py`
 * `import_excel`) — `dry_run`/`imported` are mutually exclusive depending on which call this was. */
/** Raw snake_case shapes returned by `import_excel_preview`/`import_excel_commit_valid`
 * (`backend/obs/views.py`). */
/** One field the import corrected from a source of truth, exactly as
 * `SparesViewSet._classify_import_rows` sends it. `original` is what the workbook actually
 * held, carried so the user can judge the correction and use Edit where it is wrong. */
interface ExcelImportCorrectionRaw {
  field: string;
  original: string;
  applied: string;
  source: VerifyPatternSource;
}

interface ExcelImportPreviewRawRow {
  row: number;
  status: ExcelImportRowStatus;
  errors: Record<string, string[]> | null;
  /** the sentences on this row that are NOT the operator's to fix - a
   * master value the save will add, or one it will add once confirmed. They used to arrive
   * inside `errors`, indistinguishable from a broken rule, and the working table painted the
   * two the same shade of red. Same shape, same field keys, separate key. */
  advisories: Record<string, string[]> | null;
  /** `null` when the PATTERN NUMBER cell was empty, so there was nothing to check —
   * distinct from `false`, which is a typed value that matched no source of truth. */
  pattern_matched: boolean | null;
  /** True when the ONLY thing wrong with this row is a pattern number no source of truth
   * recognises. Still not committable — clause 4.3 is unchanged — but not a breach of the
   * rules document either, and the working table tints it apart from one. */
  pattern_only_error: boolean;
  /** True when this row names a master value the rules document does not list, which the Head
   * of Department is being asked to confirm before it is added. */
  needs_master_confirmation: boolean;
  pattern_source: VerifyPatternSource | null;
  pattern_generated: boolean;
  /** Source-of-truth codes that look like the one typed, for a PATTERN NUMBER that was entered
   * and matched nothing. Empty on every other row, and empty when nothing cleared the
   * near-match floor.
   *
   * Carried as its own field rather than inside the error sentence on purpose: the backend
   * decides whether a row is tinted "PATTERN NOT FOUND" rather than painted as a rule breach
   * by comparing its error text EXACTLY, so a suggestion clause appended to that sentence
   * would repaint every one of these rows red. */
  pattern_suggestions: string[];
  corrections: ExcelImportCorrectionRaw[];
  data: {
    spare_class: string;
    equipment_class: string;
    pattern_number: string;
    description: string;
    category: SpareCategory;
    critical: boolean;
    denomination: string;
    authority: string;
    quantity_authorised: number;
    quantity_available: number;
    page: string;
    line: string;
    remarks: string;
    compartment: string;
    location: string;
    rack_position: string;
    rack_number: string;
    /** The three columns that are not part of the row's payload. SER reaches no `Spares`
     * field, and SHIP CUSTOMER CODE is reconciled against the active ship for the whole sheet
     * and then discarded. They are on the wire so the table can show the workbook's twenty
     * columns as the workbook has them.
     *
     * PICTURE PATH is STORED — the server opens the path it names and puts the photograph on
     * `Spares.image`. It travels here rather than in the payload because the payload feeds a
     * serializer whose `image` is a file field and cannot be handed a path string. */
    ser: string;
    picture_path: string;
    ship_customer_code: string;
  };
}

interface ExcelImportPreviewRawResponse {
  summary: {
    total_rows: number;
    valid_rows: number;
    invalid_rows: number;
    duplicate_rows: number;
    unique_rows: number;
    missing_essential_columns: string[];
    missing_optional_columns: string[];
    extra_columns: string[];
    patterns_generated: number;
    descriptions_corrected: number;
    categories_corrected: number;
    shortfall_rows: number;
    pattern_only_rows: number;
    confirmation_rows: number;
  };
  master_additions: MasterAdditionRaw[];
  rows: ExcelImportPreviewRawRow[];
}

/** One master value this sheet would ADD, exactly as
 * `SparesViewSet.import_excel_preview` sends it. One entry per distinct value and not per row —
 * a sheet using `PCS` on twelve rows asks one question, not twelve. */
interface MasterAdditionRaw {
  field: string;
  column: string;
  clause: string;
  value: string;
  in_rules: boolean;
  confirmation_required: boolean;
  rows: number[];
}

interface ExcelImportCommitRawResponse {
  imported: number;
  skipped_invalid: number;
  skipped_duplicate: number;
  total_rows: number;
  patterns_generated: number;
  descriptions_corrected: number;
  categories_corrected: number;
  images_attached: number;
  images_skipped: number;
  shortfall_rows: number;
  shortfall_to_survey: number;
  shortfall_to_demand: number;
  shortfall_iif: number;
  masters_added: number;
  masters_unconfirmed: { column: string; value: string; clause: string }[];
}

/** What the Return tab shows in place of the issued-to name on a row the
 * import recorded. The same words are held on the back end as
 * `services.IMPORT_SHORTFALL_ISSUED_TO_LABEL`, beside the flag they belong to. */
export const IMPORT_SHORTFALL_ISSUED_TO = "NA (recorded while import)";

export type ExcelImportRowStatus = "valid" | "invalid" | "duplicate";

export interface ExcelImportRowData {
  spareClass: string;
  equipmentClass: string;
  patternNumber: string;
  description: string;
  category: SpareCategory;
  critical: boolean;
  denomination: string;
  authority: string;
  quantityAuthorised: number;
  quantityAvailable: number;
  page: string;
  line: string;
  remarks: string;
  compartment: string;
  location: string;
  rackPosition: string;
  rackNumber: string;
  ser: string;
  picturePath: string;
  shipCustomerCode: string;
}

export interface ExcelImportPreviewRow {
  row: number;
  status: ExcelImportRowStatus;
  errorMessage: string | null;
  // The back end already sends its row errors keyed by field name
  // (`SparesViewSet._normalize_import_row_error`, backend/obs/views.py). `errorMessage` above
  // flattens them into one string for the status cell's tooltip and cannot say which cell
  // failed, so the keyed object is carried through as well and the flat string is left exactly
  // as it was. Read a key with bracket notation - `noPropertyAccessFromIndexSignature` is on.
  fieldErrors: Record<string, string[]> | null;
  /** the advisory sentences, keyed by field exactly as `fieldErrors` is.
   * Kept apart from the errors so the ERRORS column can render a broken rule in red and a
   * "will be added when you save" note in its ordinary voice - which is the difference between
   * telling an operator what to do and burying it. */
  fieldAdvisories: Record<string, string[]> | null;
  // Whether this row's PATTERN NUMBER matched a source of truth.
  // `null` means the cell was empty and nothing was checked — the rules document permits an
  // empty cell (clause 2.7.1) and such a row is auto-generated instead. `false` is the state
  // clause 5.1 asks to be shown as RED TEXT on the pattern number cell. The row's ERRORS
  // entry names the reason in words, which is the non-colour signal WCAG 1.4.1 requires.
  //
  // Nothing renders any of these four yet. They are the data half of the change; the grid
  // that paints them is rebuilt separately.
  patternMatched: boolean | null;
  /** True when the ONLY thing wrong with this row is a pattern number no
   * source of truth recognises. The row is still not committable, and still belongs under
   * "Invalid Only", but it did not break a rule of the document - so the working table tints it
   * apart from one that did and leaves the red on the PATTERN NUMBER cell alone. */
  patternOnlyError: boolean;
  /** True when this row names a master value the rules document does not
   * list. Confirming it on save adds the value to the department's Masters and commits the row. */
  needsMasterConfirmation: boolean;
  patternSource: VerifyPatternSource | null;
  /** True when this row's pattern number was generated by the application, because the
   * workbook left the cell empty. */
  patternGenerated: boolean;
  /** Source-of-truth codes that look like the one typed, shown in the ERRORS column so an
   * operator who mistyped a pattern number can find the right one without leaving the screen.
   * Empty unless this row's pattern number was entered and matched nothing, and empty when no
   * candidate cleared the near-match floor. */
  patternSuggestions: string[];
  /** Every cell corrected from a source of truth, to be shown in orange. */
  corrections: ExcelImportCorrection[];
  data: ExcelImportRowData;
}

/** One auto-corrected cell. `original` is the workbook's own value,
 * kept so the user can see what the application changed and judge whether it was right. */
export interface ExcelImportCorrection {
  field: string;
  original: string;
  applied: string;
  source: VerifyPatternSource;
}

export interface ExcelImportPreviewSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicateRows: number;
  uniqueRows: number;
  missingEssentialColumns: string[];
  missingOptionalColumns: string[];
  extraColumns: string[];
  // The three counts the requirement asks to be stated in the message
  // beside the results table — how many pattern numbers the application generated, how many
  // descriptions it corrected, and how many CRP categories it corrected.
  patternsGenerated: number;
  descriptionsCorrected: number;
  categoriesCorrected: number;
  /** How many rows that WOULD BE SAVED carry a held quantity below
   * their authorised quantity. Clause 4.5's confirmation is built from this, which is why it
   * arrives with the PREVIEW and not with the commit - the confirmation is raised before the
   * write. Zero on the OTHERS route by construction: there authorised must equal held and a
   * difference is already a hard reject. This is the ONE shortfall count in the contract. */
  shortfallRows: number;
  /** How many rows fail on nothing but an unrecognised pattern number,
   * and how many wait on a master value being confirmed. Both are SUBSETS of `invalidRows` and
   * neither is subtracted from it - each is still a row that will not be committed as it
   * stands, and a summary claiming otherwise would understate what is left to do. */
  patternOnlyRows: number;
  confirmationRows: number;
}

/** One master value the sheet would add to the ship's lists.
 * `confirmationRequired` is false for an EQUIPMENT CLASS, which clause 2.6.1 already permits the
 * ship's D787J document to name, and for a value the rules document itself lists whose master
 * row simply has not been seeded here yet - both are stated rather than asked about. */
export interface MasterAddition {
  field: string;
  column: string;
  clause: string;
  value: string;
  inRules: boolean;
  confirmationRequired: boolean;
  rows: number[];
}

export interface ExcelImportPreview {
  summary: ExcelImportPreviewSummary;
  masterAdditions: MasterAddition[];
  rows: ExcelImportPreviewRow[];
}

export interface ExcelImportCommitResult {
  imported: number;
  skippedInvalid: number;
  skippedDuplicate: number;
  totalRows: number;
  // The same three counts the preview carries, restated for the rows
  // that were actually committed, so the success message can report what the application
  // did rather than what it proposed to do.
  patternsGenerated: number;
  descriptionsCorrected: number;
  categoriesCorrected: number;
  /** What the PICTURE PATH column did. `imagesAttached` is photographs the
   * server read off its own filesystem and stored against a spare; `imagesSkipped` is rows that
   * named a path it could not use and which therefore kept the default photograph. A blank cell
   * is neither — most rows of most sheets have no picture, and counting those as skipped would
   * make the number say nothing. The preview already named the failing rows one by one. */
  imagesAttached: number;
  imagesSkipped: number;
  /** What the shortfall routing actually did. `shortfallIif` is a
   * SUBSET of the survey and demand counts and not a third destination - an item whose
   * pattern number SWMM generated goes to its category's cart marked as an IIF item and also
   * appears in the Due for IIF cart, and the quantity lives on the Survey or Demand row. */
  shortfallRows: number;
  shortfallToSurvey: number;
  shortfallToDemand: number;
  shortfallIif: number;
  /** What this commit added to the ship's master lists, and what it did
   * not. A master row is permanent and shared, so an operator who confirmed four values can
   * read back that four were written, and one who confirmed none is told which values are
   * still waiting rather than left to guess why their rows were skipped. */
  mastersAdded: number;
  mastersUnconfirmed: { column: string; value: string; clause: string }[];
}

/** The two import routes, named exactly as the back end names them on
 * `download-template/`, `import-excel-preview/` and `import-excel-commit-valid/`. The same two
 * words already type `downloadSparesImportTemplate`'s `route`, so the workbook a user downloads
 * and the route they import it on cannot drift apart. */
export type ImportRoute = "D787J" | "OTHERS";

/** One entry of the role-scoped and department-scoped Import Authority
 * list. `route` is what makes a single select enough - picking an authority settles the route,
 * so the screen never asks the user for both. */
export interface ImportAuthorityOption {
  value: string;
  label: string;
  route: ImportRoute;
}

export interface ImportAuthorityList {
  canImportD787j: boolean;
  authorities: ImportAuthorityOption[];
}

interface ImportAuthorityListRawResponse {
  can_import_d787j: boolean;
  authorities: { value: string; label: string; route: ImportRoute }[];
}

/** The four values every import endpoint now takes alongside the file.
 * Carried as one object rather than four positional arguments so a caller cannot transpose the
 * authority and the password. */
export interface ImportSelection {
  /** The `master.Department` id the sheet is tagged to — requirement 3.2.
   * It was collected on the form and sent nowhere; it is now sent with every import call and
   * honoured server-side by `SparesViewSet._import_department`. A departmental login can only
   * ever set it to its own, and the back end refuses a forged one with 403 rather than silently
   * substituting the caller's own department. */
  department: string;
  /** The `master.SubDepartment` id, Executive only. Omitted for every other department, and for
   * an Executive import that is not being attributed to one sub-department.
   *
   * NOTE, and it is a real trap: `downloadSparesImportTemplate`'s own `subDepartment` argument is
   * a workbook CODE (`"HULL"`, `"NBCD"`) and this one is a ROW ID. The two endpoints happen to
   * name the parameter the same and they do not mean the same thing. Recorded rather than
   * unified — renaming the template one would change an endpoint CP-02 already shipped. */
  subDepartment?: string;
  route: ImportRoute;
  authority: string;
  password: string;
}

/** `GET selectable-departments/`'s response — the departments this caller
 * may import on behalf of, and whether the control should lock. */
export interface SelectableDepartments {
  departments: DropdownOptionDto[];
  locked: boolean;
  selectedDepartment: string;
}

interface SelectableDepartmentsRawResponse {
  departments: { id: number; name: string }[];
  locked: boolean;
  selected_department: number | null;
}

/** One equipment class, as the Equipment Classes tab lists it. */
export interface EquipmentClassEntry {
  id: string;
  name: string;
}

/** One spare class and the equipment classes held under it.
 *
 * The spare class is READ ONLY on this tab and there is no create, rename or delete for one
 * anywhere in the application — the list is fixed by the rules document and is seeded by
 * `manage.py seed_equipment_class_defaults`. So this carries no editable field of its own. */
export interface SpareClassGroup {
  id: string;
  name: string;
  equipmentClasses: EquipmentClassEntry[];
}

/** `GET equipment_class/department-master/`'s response. */
export interface DepartmentEquipmentClasses {
  department: string;
  departmentName: string;
  /** True when the caller may act on their own department only, so the tab's department
   * control locks. The server's answer, not one derived from the length of a list. */
  locked: boolean;
  /** Whether this caller may add an equipment class. The gate itself is on the create
   * endpoint — this only decides whether the tab shows the control and what it says instead. */
  canAdd: boolean;
  spareClasses: SpareClassGroup[];
  /** Permitted by clause 2.5 for this department and not yet on its master list. Named to the
   * operator so a missing spare class is explained rather than silently absent. */
  spareClassesNotSetUp: string[];
}

interface DepartmentEquipmentClassesRawResponse {
  department: number | null;
  department_name: string;
  locked: boolean;
  can_add: boolean;
  spare_classes: {
    id: number;
    name: string;
    equipment_classes: { id: number; name: string }[];
  }[];
  spare_classes_not_set_up: string[];
}

/** `GET sub-departments/`'s response — the Executive sub-departments this
 * caller may see under one department. `isExecutive` is false, and the list empty, for every
 * other department: EXECUTIVE is the only one organised sub-department wise. */
export interface SubDepartmentList {
  department: string;
  isExecutive: boolean;
  subDepartments: DropdownOptionDto[];
  locked: boolean;
}

interface SubDepartmentListRawResponse {
  /** null when the caller named no department and is entitled to every one of them — a
   * privileged account on the listing screen. There are no sub-departments to offer, which is
   * an answer rather than an error. */
  department: number | null;
  is_executive: boolean;
  sub_departments: ({ id: number; name: string; department_id: number } | null)[];
  locked: boolean;
}

/** The `?sub_department=` value that asks for the spares carrying none.
 * Matches `users.rbac.SUB_DEPARTMENT_UNASSIGNED` on the back end exactly — the two are one
 * protocol value and neither side should spell it for itself. */
export const SUB_DEPARTMENT_UNASSIGNED = "unassigned";

/** The corrections a user has made to the working table, sent with the
 * file on every import call.
 *
 * `edits` is keyed by the workbook's own row number - the same `row` the preview sends back -
 * and each entry names the columns the user changed and the value they typed. `removedRows`
 * lists the rows deleted from the working table, which are dropped from the sheet before it is
 * validated and never reach the database.
 *
 * Both halves are CELL VALUES and never a verdict. The server re-parses the workbook, applies
 * these, and puts the result through the same rule engine, serializer and `full_clean()` as an
 * untouched sheet, so a correction cannot make a row pass a rule it fails. */
export interface ImportWorkingTable {
  edits: Record<number, Record<string, string>>;
  removedRows: number[];
  /** The master values the Head of Department confirmed on this save, as
   * `{field, value}` pairs. Sent on the COMMIT only - a preview settles nothing and must not
   * create a master row from a file the operator may never commit. Absent or empty on every
   * preview and on any save that introduces nothing, so the ordinary body is unchanged.
   *
   * Like `edits`, these are VALUES and never verdicts: the server re-derives what the sheet
   * actually needs on every call and confirms only what it finds there, so a client cannot
   * confirm a value into the master list by naming one the sheet does not use. */
  confirmedMasterAdditions?: { field: string; value: string }[];
}

/** One row built by hand — requirement 3.3's Mode 1.
 *
 * `row` is the row's number in the working table, assigned by the screen and renumbered 1..n
 * on every post, because a hand-built table has no workbook row numbers to inherit. Every
 * other key is one of the seventeen names `IMPORT_EDIT_FIELD_TO_SHEET_KEY` carries server
 * side — the same vocabulary an `edits` entry uses, so the two modes speak one language.
 *
 * Every value is a CELL VALUE, typed exactly as it would have been typed into the workbook,
 * and never a verdict. AUTHORITY and SHIP CUSTOMER CODE are absent on purpose: the first is a
 * whole-batch gate carried by the selection, and the second is the active ship's own code,
 * which the server writes into every row rather than trusting a client to state. */
export interface ImportManualRow extends Record<string, string | number> {
  row: number;
}

/** Every closed list the hand-entry form and the row editor offer, for
 * the caller's own department and one route, straight from the same `services` register the
 * rule engine validates against. Nothing here is hard-coded in a component. */
export interface ImportValueLists {
  route: ImportRoute;
  department: string;
  spareClasses: DropdownOptionDto[];
  /** Permitted by clause 2.5 for this department and route, but not yet on the ship's master
   * list — so a row using one would fail R-010-MASTER. Named to the operator rather than
   * silently dropped from the list above. */
  spareClassesNotSetUp: string[];
  /** Existing equipment-class NAMES, keyed by the spare class they are STORED under. This is
   * the Equipment Classes tab's question — which spare class holds this name — and it is not
   * the question a hand-entry dropdown asks. Use `equipmentClassOptions` for that. */
  equipmentClasses: Record<string, string[]>;
  /** What the Equipment Class control may OFFER, keyed by the spare
   * class the row has chosen.
   *
   * Not the same map as `equipmentClasses`, and the difference is load-bearing. An equipment
   * class name is unique per DEPARTMENT, so the seeded MICELLANEOUS is stored under
   * SPARES_MICELLANEOUS and under nothing else — yet clause 2.6 permits that same name under
   * SPARES_PLL and SPARES_CONSUMABLE, and the rule engine accepts it there. Reading the stored
   * grouping literally left those spare classes with an empty list on a freshly seeded ship.
   * The back end builds this one from the rule instead. */
  equipmentClassOptions: Record<string, string[]>;
  categories: DropdownOptionDto[];
  denominations: DropdownOptionDto[];
  rackPositions: DropdownOptionDto[];
  criticalValues: DropdownOptionDto[];
}

/** `GET template-routes/` — which of the two Download Template buttons
 * can actually succeed for this scope. See `SparesViewSet.import_template_routes`. */
export interface ImportTemplateRoutes {
  department: string;
  routes: ImportRoute[];
}

/** the ship's adopted MO customer code, as `import-ship-customer-code/`
 * reports it.
 *
 * `isAdopted` is false on a fresh install and stays false until the FIRST workbook is imported
 * — that workbook's SHIP CUSTOMER CODE column is what the ship adopts, and every import after it
 * is checked against the adopted value. `canReset` is the server's answer about this caller, not
 * a guess made from a role name in the browser. */
export interface ShipCustomerCodeState {
  customerCode: string;
  isAdopted: boolean;
  canReset: boolean;
  /** Present only on the clear response — the sentence to show after clearing. */
  detail?: string;
}

interface ShipCustomerCodeStateRawResponse {
  customer_code: string;
  is_adopted: boolean;
  can_reset: boolean;
  detail?: string;
}

/** what the Clear OBS Spares control should say before it is pressed.
 *
 * `scope` is `"all"` for the application administrator, who clears the whole table, and
 * `"department"` for a Head of Department, who clears his own department only — `departmentName`
 * carries which one, and is null for the whole-ship scope. `spareCount` is live, so the
 * confirmation names a real number instead of "all data". */
export interface SparesPurgeState {
  canPurge: boolean;
  scope: "all" | "department";
  departmentName: string | null;
  spareCount: number;
}

interface SparesPurgeStateRawResponse {
  can_purge: boolean;
  scope: "all" | "department";
  department_name: string | null;
  spare_count: number;
}

/** What `POST spares/purge/` reports back. `deleted` is a per-table count, keyed by the table
 * the rows came out of, so the page can say exactly what went rather than only how many. */
export interface SparesPurgeResult {
  deleted: Record<string, number>;
  scope: "all" | "department";
  detail: string;
}

interface ImportValueListsRawResponse {
  route: ImportRoute;
  department: string;
  spare_classes: DropdownOptionDto[];
  spare_classes_not_set_up: string[];
  equipment_classes: Record<string, string[]>;
  /** Optional so a front end deployed ahead of its back end degrades to an empty map rather
   * than `undefined` reaching a template — the adapter defaults it. */
  equipment_class_options?: Record<string, string[]>;
  categories: DropdownOptionDto[];
  denominations: DropdownOptionDto[];
  rack_positions: DropdownOptionDto[];
  critical_values: DropdownOptionDto[];
}

/** written once because the GET and the DELETE return the same three keys,
 * and the page reads the answer back the same way from either. */
function adaptShipCustomerCodeState(
  response: ShipCustomerCodeStateRawResponse,
): ShipCustomerCodeState {
  return {
    customerCode: response.customer_code,
    isAdopted: response.is_adopted,
    canReset: response.can_reset,
    detail: response.detail,
  };
}

function flattenExcelRowErrors(errors: Record<string, string[]> | null): string | null {
  if (!errors) return null;
  return Object.entries(errors)
    .map(([field, messages]) => `${field}: ${messages.join(" ")}`)
    .join("; ");
}

function adaptExcelImportPreviewRow(row: ExcelImportPreviewRawRow): ExcelImportPreviewRow {
  return {
    row: row.row,
    status: row.status,
    errorMessage: flattenExcelRowErrors(row.errors),
    // Carried through unflattened alongside the string above, so a later
    // change can mark the cell that actually failed. The raw property is already typed
    // `Record<string, string[]> | null`, so no cast and no new type is needed.
    fieldErrors: row.errors,
    fieldAdvisories: row.advisories,
    // Carried straight through. The raw properties are already the
    // right types, so no cast and no re-shaping is needed — `corrections` is copied into a
    // new array rather than aliased so a consumer cannot mutate the parsed response.
    patternMatched: row.pattern_matched,
    patternOnlyError: row.pattern_only_error,
    needsMasterConfirmation: row.needs_master_confirmation,
    patternSource: row.pattern_source,
    patternGenerated: row.pattern_generated,
    // copied rather than aliased, for the same reason `corrections` is, and defaulted to an
    // empty array so a response from a backend that predates the field adapts to a row the
    // grid can render rather than to `undefined`.
    patternSuggestions: [...(row.pattern_suggestions ?? [])],
    corrections: row.corrections.map((correction) => ({ ...correction })),
    data: {
      spareClass: row.data.spare_class,
      equipmentClass: row.data.equipment_class,
      patternNumber: row.data.pattern_number,
      description: row.data.description,
      category: row.data.category,
      critical: row.data.critical,
      denomination: row.data.denomination,
      authority: row.data.authority,
      quantityAuthorised: row.data.quantity_authorised,
      quantityAvailable: row.data.quantity_available,
      page: row.data.page,
      line: row.data.line,
      remarks: row.data.remarks,
      compartment: row.data.compartment,
      location: row.data.location,
      rackPosition: row.data.rack_position,
      rackNumber: row.data.rack_number,
      ser: row.data.ser,
      picturePath: row.data.picture_path,
      shipCustomerCode: row.data.ship_customer_code,
    },
  };
}

function adaptExcelImportPreview(response: ExcelImportPreviewRawResponse): ExcelImportPreview {
  return {
    summary: {
      totalRows: response.summary.total_rows,
      validRows: response.summary.valid_rows,
      invalidRows: response.summary.invalid_rows,
      duplicateRows: response.summary.duplicate_rows,
      uniqueRows: response.summary.unique_rows,
      missingEssentialColumns: response.summary.missing_essential_columns,
      missingOptionalColumns: response.summary.missing_optional_columns,
      extraColumns: response.summary.extra_columns,
      patternsGenerated: response.summary.patterns_generated,
      descriptionsCorrected: response.summary.descriptions_corrected,
      categoriesCorrected: response.summary.categories_corrected,
      shortfallRows: response.summary.shortfall_rows,
      patternOnlyRows: response.summary.pattern_only_rows,
      confirmationRows: response.summary.confirmation_rows,
    },
    masterAdditions: (response.master_additions ?? []).map((addition) => ({
      field: addition.field,
      column: addition.column,
      clause: addition.clause,
      value: addition.value,
      inRules: addition.in_rules,
      confirmationRequired: addition.confirmation_required,
      rows: [...addition.rows],
    })),
    rows: response.rows.map(adaptExcelImportPreviewRow),
  };
}

function adaptExcelImportCommit(response: ExcelImportCommitRawResponse): ExcelImportCommitResult {
  return {
    imported: response.imported,
    skippedInvalid: response.skipped_invalid,
    skippedDuplicate: response.skipped_duplicate,
    totalRows: response.total_rows,
    patternsGenerated: response.patterns_generated,
    descriptionsCorrected: response.descriptions_corrected,
    categoriesCorrected: response.categories_corrected,
    imagesAttached: response.images_attached ?? 0,
    imagesSkipped: response.images_skipped ?? 0,
    shortfallRows: response.shortfall_rows,
    shortfallToSurvey: response.shortfall_to_survey,
    shortfallToDemand: response.shortfall_to_demand,
    shortfallIif: response.shortfall_iif,
    mastersAdded: response.masters_added ?? 0,
    mastersUnconfirmed: (response.masters_unconfirmed ?? []).map((entry) => ({ ...entry })),
  };
}

function firstStringFromArrayField(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return Array.isArray(value) && value.length ? String(value[0]) : null;
}

/** `import_excel_preview`/`import_excel_commit_valid` only 400 for genuine file-level failures
 * (missing/invalid file, corrupt workbook, no header row, row-limit exceeded) — row-level
 * problems are normal 200 preview output, not an HTTP error, so the `file`-array branch carries
 * most of the load (unlike `import_excel`'s three-shaped 400, these two never reject on unknown
 * columns or per-row errors).
 *
 * Four refusals now reach here that could not before — an unentitled role
 * on the D787J route (403), a missing or unusable route or authority (400), a wrong password
 * (400), and a sheet whose AUTHORITY column disagrees with the selected authority (400, keyed on
 * `file`, so the existing branch already words it). The three field-keyed ones are read in the
 * order the form shows them, and anything else falls through to the project-wide
 * `getErrorMessage`, which reads the `{"status":"error","message":...}` envelope that
 * `swmm.exceptions.custom_exception_handler` puts on every one of them. Reused rather than
 * re-implemented — it is the same reader `feedbackInterceptor` uses everywhere else. */
function describeExcelPreviewError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return error instanceof Error ? error.message : "Something went wrong. Please try again.";
  }
  const body = error.error as Record<string, unknown> | null;
  if (body && typeof body === "object") {
    for (const key of ["file", "route", "authority", "password", "rows"]) {
      const message = firstStringFromArrayField(body, key);
      if (message) return message;
    }
  }
  return getErrorMessage(error);
}
