import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, ChangeDetectorRef, signal, computed, effect, OnInit, AfterViewChecked, ElementRef, Renderer2, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { RouterModule, ActivatedRoute, Router } from "@angular/router";
import { ColDef, GridReadyEvent, GridApi, ICellRendererParams, CellCallbackParams } from "ag-grid-community";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import { InputField } from "../../../../shared/components/input-field/input-field";
import { TextareaInput } from "../../../../shared/components/textarea-input/textarea-input";
import { ModalComponent } from "../../../../shared/components/modal/modal.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SrarService, SrarRecord, SrarCarryForward, SrarApiResponse, SrarRoutineHourOption } from "../services/srar.service";
import { AppService } from "../../../../Core/services/app/app.service";
import { NotificationService } from "../../../../Core/services/notification";
import { AccessControlService } from "../../../../Core/navigation/access-control.service";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
/** Placeholder category code for boiler equipment. Not a CMMS Ch_Master_Equipment_Type
 *  id — see the comment at its use in loadMasterEquipmentsFromBackend(), and keep it in
 *  step with BOILER_CATEGORY_CODE in srar/management/commands/seed_srar_demo_equipment.py. */
export const BOILER_CATEGORY_CODE = "BOILER";

export function getRandom4DigitNumber(): number {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return 1000 + (array[0] % 9000);
}

const SRAR_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export type OpsValue = number | string | null | undefined;
export type StringNullable = string | null | undefined;

export interface SrarSubTab {
  id: number;
  title: string;
  shortTitle: string;
  icon: string;
}

export type FormItemValue = string | number | boolean | File[] | null | undefined;


export interface EquipmentItem {
  [key: string]: FormItemValue;
  id?: number;
  // The sfd.ShipEquipment id this row is about — distinct from `id` above. Set from
  // loadRunningHoursEquipment(); sent as `sfd_details` on save so next month's
  // carry-forward can match this equipment by id instead of by name.
  shipEquipmentId?: number;
  // This row's own SrarEquipmentExploitation primary key, once this report has a saved
  // Tab 1 row for this equipment — set only from a genuine previously-saved row (see
  // savedEquipmentHoursByShipEquipmentId), never guessed from `id`/`shipEquipmentId`.
  // Only ever include `id` in the save payload when this is set, so a not-yet-saved
  // row's ShipEquipment id can never be mistaken for a SrarEquipmentExploitation id.
  srarExploitationId?: number | null;
  name: string;
  nomenclature?: string;
  eqptCode?: string;
  locOnBoard?: string;
  prevHours: number | string;
  monthlyHours?: string;
  cumulativeHours?: string;
  duringMonthHours?: number;
  duringMonthMinutes?: number;
  totalHours?: string;
  subDept?: string;
  serNo?: string;
}

export interface BoilerSteamingItem {
  [key: string]: FormItemValue;
  id?: number;
  /** The sfd.ShipEquipment this row is about — declared explicitly (not left to the
   *  index signature) so reconcileEquipmentRows can match rows by equipment id. */
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  locOnBoard: string;
  serNo: string;
  hrsSteamedDuringMonth: string;
  hrsSteamedSinceComm: string;
  hrsAbove80: string;
  lastEstOlgDate: string;
  hrsSteamedSinceLastOlg: string;
  hrsSteamedAtLastOlg: string;
  lastEstOlgDate2: string;
  hrsSteamedSinceLastOlg2: string;
  hrsSteamedAtLastOlg2: string;
  lastRetubingDate: string;
  hrsSteamedSinceLastRetubing: string;
  hrsSteamedAtLastRetubing: string;
  lastHydraulicTestDate: string;
  nextInspectionDate: string;
  lifeAssessedMonths: string;
}

export interface BoilerAlkalinityItem {
  [key: string]: FormItemValue;
  id?: number;
  /** The sfd.ShipEquipment this row is about — declared explicitly (not left to the
   *  index signature) so reconcileEquipmentRows can match rows by equipment id. */
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  locOnBoard: string;
  serNo: string;
  salinityLastWeek: string;
  chlorideDuringMonth: string;
  excessSalinity: string;
  alkalinityN: string;
  phYarr: string;
  tdsMax750: string;
  phosphate1060: string;
  phosphate0: string;
  alkalinityMax: string;
  alkPpm: string;
  alkalinityPercent: string;
  phJvn: string;
  tdsMax750Jvn: string;
  phosphate1060Jvn: string;
  alkalinityPercentCommon: string;
}

export interface ActivityItem {
  [key: string]: FormItemValue;
  id?: number;
  dateRange: string;
  shipState: string;
  shipLocation: string;
  activityType: string;
  activityDetail: string;
  remarks: string;
}

export interface TorsionMeterItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  srNo: number;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  opsNonOps: string;
  torsionMeterRdg: string;
  maxRpmAchieved: string;
  nonOpsSince: string;
  lastCalibrationOn: string;
  nextCalibrationDue: string;
}

export interface IccpItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  srNo?: number;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  opsNonOps: string;
  nonOpsSince: string;
}

export interface H2SSensorItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  srNo?: number;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  opsNonOps: string;
  nonOpsSince: string;
  lastCalibratedOn: string;
  nextCalibration: string;
}

export interface StpItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  srNo?: number;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  status: string;
  effluentTestDate: string;
  remarks: string;
}

export interface MagazineItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  srNo?: number;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  status: string;
  lastTrialsTaken?: string;
  nextTrialsDue?: string;
}

export interface TestKitItem {
  [key: string]: FormItemValue;
  id?: number;
  description: string;
  opsNonOps: string;
  nonOpsSince1: string;
  calibrationDate: string;
  nextCalibrationDueDate: string;
  nonOpsSince2?: string;
}

export interface CentrifugeItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  serNo: string;
  locOnBoard: string;
  opsNonOps: string;
  nonOpsSince: string;
  lastCalibratedOn: string;
  nextCalibration: string;
}

export interface SafetyDeviceItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptSerNo?: string;
  eqptCode: string;
  locOnBoard: string;
  sdcConductedBy: string;
  dateOfSdc: string;
  sfcGmsKWh: string;
  lastSfcTrialDate: string;
  displacementDuringSfc: string;
  status: string;
}

export interface InjectorFipItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  fipInMonth: string;
  rhSinceInstallation: string;
  prevRhSinceInstallation?: string;
  isRegimeMismatch?: boolean;
  hrsBelow30: string;
  hrs30to50: string;
  hrs50to70: string;
  hrs70to100: string;
  lubOilConsCurrentMonth: string;
  dateOfInjectorCalibration: string;
  occasionsReplacement: string;
  inOutWhichReplaced: string;
  fuelConsumptionTons: string;
  remarks: string;
}

export interface ReplacementItem {
  [key: string]: FormItemValue;
  id?: number;
  eqptName: string;
  eqptSrNumber: string;
  dateOfReplacement: string;
  subAssemblyUnitName: string;
  reasonOfReplacement: string;
  lifeSinceInstallation?: string;
  lastCalibratedOn?: string;
  nextCalibration?: string;
  remarks: string;
  tabValue?: string;
}

export interface RoutineItem {
  [key: string]: FormItemValue;
  id?: number;
  eqptName: string;
  eqptSrNumber: string;
  date: string;
  descriptionForRoutine: string;
  undertakenByWhom: string;
  tabValue?: string;
}

export interface FptMainEngineSpecificItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  serNo: string;
  fuelRackDbl: string;
  fciThrottleMarking: string;
  lastEhmTrialsDate: string;
  pitch: string;
  maxRpm: string;
  ratedPower: string;
  maxAchievedPower: string;
  remarks: string;
}

export interface FptDieselGeneratorLoadItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  location: string;
  eqptSerNo: string;
  date: string;
  occasionReason: string;
  ratedLoad: string;
  maxLoadAchieved: string;
  conductedBy: string;
  lastEhmTrialsDate: string;
  remarks: string;
}

export interface GasTurbineExploitationItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  serNo: string;
  totalRhInMonth: string;
  rhEngine1: string;
  rhEngine2: string;
  totalRhSi: string;
  prevTotalRhSi?: string;
  prevRhRegime1Si?: string;
  prevRhRegime2Si?: string;
  prevRhRegime3Si?: string;
  /** Since-installation baselines for the start/engagement counters, carried forward from
   *  the last filed return exactly like the running-hour ones above. The count columns the
   *  table calls SI are held in legacy-named fields (noOfRepOrders = cold starts SI,
   *  fuelExploitation = hot starts SI, status = false starts SI, rhEngine2 = tech starts SI,
   *  lastEhmTrialDate = astern engagements SI) — see the tab_10_gas_turbine save mapping. */
  prevColdStartsSi?: string;
  prevHotStartsSi?: string;
  prevFalseStartsSi?: string;
  prevTechStartsSi?: string;
  prevAsternEngagementsSi?: string;
  prevStopOrdersSi?: string;
  isRegimeMismatch?: boolean;
  status: string;
  nonOpsSince: string;
  lastCalibrationDate: string;
  lastEhmTrialDate: string;
  lastFptDate: string;
  fuelExploitation: string;
  rhRegime1InMonth: string;
  rhRegime2InMonth: string;
  rhRegime3InMonth: string;
  gslEngine1_1_0to1_25: string;
  rhRegime1Si: string;
  rhRegime2Si: string;
  rhRegime3Si: string;
  gslEngine2_1_0to1_25: string;
  unscheduledEngagement: string;
  noOfOccasion: string;
  noOfRepOrders: string;
  gslChemQty: string;
  /** The last two columns of the Step 10 Gas Turbine table. Its header declares 26
   *  columns but the body only rendered 24 cells, so "No of Prop Stop Orders / SI" and
   *  "Last Chem Clg" had no input at all — nothing could be typed into them, and the
   *  payload sent a hardcoded 0 for the first and nothing for the second, even though
   *  GasTurbineExploitation has had no_of_stop_orders_si and last_chem_clg all along. */
  noOfStopOrdersSi: string;
  lastChemClg: string;
}

export interface DieselReductionGearItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  serNo: string;
  hrsForMonth: string;
  /** Readonly: previous month's since-installation total + this month's hours. */
  hrsSinceInstallation: string;
  prevHrsSinceInstallation?: string;
}

export interface GtReductionGearItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  eqptSerNo: string;
  totalRhInMonth: string;
  totalRhsi: string;
  prevTotalRhsi?: string;
  hoRegimeBelow0_25: string;
  hoRegimeBelow0_25Si: string;
  prevHoRegimeBelow0_25Si?: string;
  hoRegime0_25to0_5: string;
  hoRegime0_25to0_5Si: string;
  prevHoRegime0_25to0_5Si?: string;
  hoRegime0_5to0_75: string;
  hoRegime0_5to0_75Si: string;
  prevHoRegime0_5to0_75Si?: string;
  isRegimeMismatch?: boolean;
  slidingHours0_25: string;
  slidingHours0_25Si: string;
  prevSlidingHours0_25Si?: string;
  /** Service Life is the return's (A-B): Total R/H minus Trailing R/H. Summing this
   *  month's (A-B) onto last month's SI gives the same figure as (total SI - trailing SI),
   *  so it carries forward on the same rule as every other SI column here. */
  serviceLife: string;
  serviceLifeSi: string;
  prevServiceLifeSi?: string;
  routineRegime1: string;
  routineRegime1Si: string;
  prevRoutineRegime1Si?: string;
  routineRegime2: string;
  routineRegime2Si: string;
  prevRoutineRegime2Si?: string;
  routineRegime3: string;
  routineRegime3Si: string;
  prevRoutineRegime3Si?: string;
  routineRegime4: string;
  routineRegime4Si: string;
  prevRoutineRegime4Si?: string;
}

export interface GtgExploitationItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  serNo: string;
  rhInSea: string;
  rhInHarbour: string;
  totalRhInMonth: string;
  totalRhsi: string;
  prevTotalRhsi?: string;
  noOfColdStarts: number;
  noOfColdStartsSi?: number;
  prevColdStartsSi?: string;
  noOfHotStarts: number;
  noOfHotStartsSi?: number;
  prevHotStartsSi?: string;
  noOfBatteryHotStarts: number;
  noOfBatteryHotStartsSi?: number;
  prevBatteryHotStartsSi?: string;
  noOfBatteryColdStarts: number;
  noOfBatteryColdStartsSi?: number;
  prevBatteryColdStartsSi?: string;
  lastChemClgDateReason: string;
}

export interface DgufGeneratorItem {
  [key: string]: FormItemValue;
  shipEquipmentId?: number;
  srNo: number;
  eqptSerNo: string;
  eqptCode: string;
  eqptName: string;
  locOnBoard: string;
  daNo: string;
  rhSeaAnchorage: string;
  rhHarbour: string;
  totalRhMonth: string;
}

export interface GtgReductionGearItem {
  [key: string]: FormItemValue;
  id?: number;
  shipEquipmentId?: number;
  eqptName: string;
  nomenclature: string;
  eqptCode: string;
  locOnBoard: string;
  serNo: string;
  rgRunningHours: string;
  noOfHotStarts: number;
  noOfColdStarts: number;
  rhInHarbour: string;
  rhInSea: string;
  inMonthsSi: string;
  prevInMonthsSi?: string;
}

export interface LubItem {
  [key: string]: FormItemValue;
  name: string;
  quantity: number;
  unit: string;
}

export interface RhExtensionItem {
  [key: string]: FormItemValue;
  shipEquipmentId?: number;
  eqptShipName?: string;
  eqptName: string;
  location: string;
  nomenclature?: string;
  serNo: string;
  /** Label of the selected routine ("500H"), what the summary and PDF print. */
  onRoutine: string;
  /** master.Frequency pk behind that label — RHExtension.on_routine is a FK to it, and
   *  it used to be saved as a hardcoded null while only the free text was stored. */
  onRoutineId?: number | null;
  rhDuringTrial: string;
  trialConductedBy: string;
  authorityLetter: File[] | null;
  authorityLetterRef?: string;
  rhdi?: string;
  rhExtensionGranted: string;
  rhLeftExpiry: string;
}

export interface RunningParameters {
  [key: string]: FormItemValue;
  baselineSinceCommHours?: number;
  baselineSinceCommMinutes?: number;
  baselineSinceCommDistance?: number;
  duringMonthHours: number;
  duringMonthMinutes: number;
  duringMonthDistance: string;
  sinceCommHours: string;
  sinceCommDistance: string;
  maxSpeedDuringMonth: string;
  maxSpeedDurationHours: number;
  maxSpeedDurationMinutes: number;
  maxSpeedDate: string;
  maxShaftRpm: string;
}

export interface LookupItem {
  id?: number;
  name: string;
}

interface SrarEquipmentLookupRow {
  id?: number | string;
  // The underlying sfd.ShipEquipment id — set only on rows actually linked via "Add
  // SRAR Equipment" (Masters); distinct from `id` above, which is this row's own
  // SrarEquipmentTypeList id. This is the stable key equipment-driven tabs reconcile
  // against so masters additions/removals reflect here without losing entered data.
  equipment_id?: number | string;
  name?: string;
  nomenclature?: string;
  srar_txt?: string;
  srar_type?: string;
  equipment_desc?: string;
  // Joined from the linked sfd.ShipEquipment — the real CMMS values, used by tabs
  // whose form shows them verbatim rather than a synthesised label.
  equipment_code?: string;
  serial_no?: string;
  location_on_board?: string;
  equipment_type_id?: number | string;
  universal_id_ch_master_equipment_type?: number | string;
  cmms_id?: number | string;
  equipment_category_code?: string;
}

interface CmmsSyncLogLine {
  text: string;
  tone: "info" | "success" | "update" | "skipped" | "error";
}

interface HttpErrorLike {
  error?: { message?: string };
  message?: string;
}

@Component({
  selector: "app-srar-transaction",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    IconComponent,
    DataGrid,
    PanelCard,
    SelectInput,
    InputField,
    TextareaInput,
    ModalComponent,
    HelpGuidance
    , ButtonComponent],
  templateUrl: "./srar-transaction.component.html",
  styleUrls: ["./srar-transaction.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SrarTransactionComponent implements OnInit, AfterViewChecked {
  readonly helpHtml = `
    <h6 class="fw-bold mb-2">Ship Staff Guidance - Follow these steps in order</h6>
    <ul class="mb-0">
      <li> <strong>Select month and year</strong>, then click "FILL SRAR Details" to start or resume that month's SRAR.</li>
      <li> <strong>Track status in the table</strong> - Draft, CO Approval Pending, CO Approved & CMMS Sync Pending, or CMMS Synced.</li>
      <li> <strong>Use the row actions</strong> to view or edit details, send to INSMA, or export the ACCDB file.</li>
    </ul>
  `;

  private readonly srarService = inject(SrarService);
  private readonly appService = inject(AppService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly hostElement = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly toaster = inject(NotificationService);
  private readonly accessControl = inject(AccessControlService);
  srarId: number | null = null;
  activeSubTab = signal<number>(1);
  // Placeholder until loadDashboard()'s applyNextAvailablePeriod() sets these to the
  // period right after the latest filed SRAR — see loadDashboard().
  selectedMonth = signal<string>(SRAR_MONTH_NAMES[new Date().getMonth()]);
  selectedYear = signal<number>(new Date().getFullYear());
  shipId: number | null = null;
  carryForward: SrarCarryForward = {
    fuel_balance_last_month: 0,
    avcat_balance_last_month: 0,
    equipment_hours: [],
    injector_fip: [],
    safety_device_checks: [],
    gas_turbine: [],
    reduction_gear: [],
    diesel_reduction_gear: [],
    gtg: [],
    gtg_reduction_gear: [],
    fpt_main_engine: null,
    rh_extensions: []
  };
  isCmmsSynced = computed(() => {
    const match = this.findExistingRecordForSelection();
    return Boolean(match?.cmms_sync_status ?? match?.cmmsSyncStatus ?? false);
  });
  showDetails = signal<boolean>(false);
  showEoDetailsModal = signal<boolean>(false);
  isExporting = signal<boolean>(false);
  /** Was its own `commonApiService.getCurrentUser()` call comparing
   * `profile.role_master_detail.role_name` — folded into the shared, matrix-aware
   * `AccessControlService.hasAnyRole()` so this and every other role check in the app read the
   * same source instead of silently risking disagreement with it. */
  readonly isCoUser = computed(() => this.accessControl.hasAnyRole(["CO"]));
  coApprovalChecked = signal<boolean>(false);
  currentReportSentToCo = signal<boolean>(false);
  currentReportCoApproved = signal<boolean>(false);
  currentReportCmmsSynced = signal<boolean>(false);

  /** Whether the "Submit to CO" button applies to this viewer and this return.
   *  A CO approves rather than submits, and an already-approved or synced return must
   *  not be resubmitted — the submit path clears co_approved, so that would drop an
   *  approved return back to Draft. */
  readonly canSubmitToCo = computed(() =>
    this.activeSubTab() === 15
    && !this.isCoUser()
    && !this.currentReportCoApproved()
    && !this.currentReportCmmsSynced()
  );

  /** What to show at step 15 in place of the Submit button. */
  readonly submitStatusNote = computed(() => {
    if (this.currentReportCmmsSynced()) return "Synced with CMMS.";
    if (this.currentReportCoApproved()) return "Approved by CO — CMMS sync pending.";
    if (this.isCoUser() && this.currentReportSentToCo()) return "Awaiting your approval.";
    if (this.isCoUser()) return "Not yet submitted to CO by the ship.";
    return "Awaiting CO approval.";
  });
  private gridApi: GridApi | null = null;


  private setExportingState(exporting: boolean): void {
    this.isExporting.set(exporting);

    if (typeof document !== "undefined") {
      const exportButtons = document.querySelectorAll(".grid-action-export");
      exportButtons.forEach((btn) => {
        if (exporting) {
          btn.setAttribute("disabled", "disabled");
          btn.classList.add("disabled");
          btn.setAttribute("title", "Exporting SRAR...");
        } else {
          btn.removeAttribute("disabled");
          btn.classList.remove("disabled");
          btn.setAttribute("title", "Export SRAR");
        }
      });
    }

    if (this.gridApi) {
      this.gridApi.refreshCells({ force: true });
    }
  }

  eoDetails = {
    writerContactNo: "",
    rank: "",
    name: "",
    personalNo: "",
    contactNo: "",
    sendToCo: false
  };

  months = SRAR_MONTH_NAMES;
  years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

  get monthOptions(): DropdownOption[] {
    return this.months.map(m => ({ label: m, value: m }));
  }

  get yearOptions(): DropdownOption[] {
    return this.years.map(y => ({ label: String(y), value: y }));
  }

  transactionSubTabs: SrarSubTab[] = [
    { id: 1, title: "Ship Running Details", shortTitle: "Running Details", icon: "activity" },
    { id: 2, title: "Boiler Steaming Detail", shortTitle: "Boiler Steaming", icon: "flame" },
    { id: 3, title: "Ship Activity", shortTitle: "Ship Activity", icon: "navigation" },
    { id: 4, title: "Fuel / AVCAT / Torsionmeter", shortTitle: "Fuel & Torsion", icon: "droplet" },
    { id: 5, title: "ICCP / H2S Sensor / STP / MFFS", shortTitle: "Sensors & STP", icon: "shield-check" },
    { id: 6, title: "Test Kits / Centrifuge", shortTitle: "Test Kits", icon: "droplet" },
    { id: 7, title: "Diesel Engine & SDC", shortTitle: "Diesel Engine", icon: "cpu" },
    { id: 8, title: "DGUF", shortTitle: "DGUF", icon: "chart-bar" },
    { id: 9, title: "Full Power Trials", shortTitle: "Full Power", icon: "gauge" },
    { id: 10, title: "GT / RG Exploitation", shortTitle: "GT / RG", icon: "zap" },
    { id: 11, title: "GTG Exploitation", shortTitle: "GTG", icon: "zap" },
    { id: 12, title: "Lubricant Consumption", shortTitle: "Lubricant", icon: "box" },
    { id: 13, title: "R/H Extension", shortTitle: "R/H Extension", icon: "clock" },
    { id: 14, title: "EO Remark", shortTitle: "EO Remark", icon: "file-text" },
    { id: 15, title: "Final Page", shortTitle: "Final Page", icon: "circle-check-big" },
  ];

  records = signal<SrarRecord[]>([]);

  columnDefs: ColDef[] = [
    {
      headerName: "S.No",
      valueGetter: "node.rowIndex + 1",
      flex: 1,
      minWidth: 80,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-semibold text-white/90">${params.value}</span>`;
      },
    },
    {
      headerName: "Year",
      field: "year",
      flex: 1.5,
      minWidth: 100,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-semibold text-white">${params.value}</span>`;
      },
    },
    {
      headerName: "Month",
      field: "month",
      flex: 1.5,
      minWidth: 120,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        return `<span class="font-semibold text-white">${params.value}</span>`;
      },
    },
    {
      headerName: "Status",
      field: "approvalStatus",
      flex: 1.8,
      minWidth: 140,
      sortable: true,
      filter: true,
      cellRenderer: (params: ICellRendererParams) => {
        const val = params.value;
        let status = "Draft";
        if (typeof val === "string") {
          status = val;
        } else if (typeof val === "object" && val !== null) {
          status = String(val.label || val.name || val.value || "Draft");
        }
        // Matched against the status strings the dashboard API actually returns
        // ("CMMS Synced", "CO Approved & CMMS Sync Pending", "Sent to CO Approval",
        // "Draft"). The old list — Approved / In Review / Pending — matched none of
        // them, so every row rendered the same grey badge and CO-approved returns were
        // visually indistinguishable from ones still awaiting approval.
        let badgeClass = "badge-secondary";
        if (status === "CMMS Synced") badgeClass = "badge-success";
        else if (status.startsWith("CO Approved")) badgeClass = "badge-info";
        else if (status === "Sent to CO Approval") badgeClass = "badge-warning";
        return `<span class="status-pill ${badgeClass}">${status}</span>`;
      },
    },
    {
      headerName: "Action",
      flex: 2,
      minWidth: 220,
      sortable: false,
      filter: false,
      cellRenderer: (params: ICellRendererParams) => {
        const row = params.data as SrarRecord | undefined;
        const isSynced = Boolean(row?.cmms_sync_status ?? row?.cmmsSyncStatus ?? false);
        const isPushing = this.isPushingToCmms();
        const canPushToCmms = this.isCoUser() && Boolean(row?.co_approved) && !isSynced && !isPushing;
        const disabledAttr = canPushToCmms ? '' : 'disabled="disabled"';
        const syncClass = canPushToCmms ? 'grid-action-pill grid-action-sync' : 'grid-action-pill grid-action-sync disabled';
        const syncTitle = isSynced
          ? 'Synced with CMMS'
          : isPushing
            ? 'Pushing to CMMS...'
            : canPushToCmms
              ? 'Push SRAR to CMMS'
              : 'Only CO can sync after CO approval';

        const isExporting = this.isExporting();
        const exportDisabledAttr = isExporting ? 'disabled="disabled"' : '';
        const exportClass = isExporting ? 'grid-action-pill grid-action-export disabled' : 'grid-action-pill grid-action-export';
        const exportTitle = isExporting ? 'Exporting SRAR...' : 'Export SRAR';

        return `
          <div class="flex items-center gap-2">
            <button class="${syncClass}" title="${syncTitle}" ${disabledAttr}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path>
                <path d="M3 3v5h5"></path>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"></path>
                <path d="M16 16h5v5"></path>
              </svg>
            </button>
            <button class="${exportClass}" title="${exportTitle}" ${exportDisabledAttr}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="9" y1="12" x2="15" y2="12"></line>
                <line x1="9" y1="16" x2="15" y2="16"></line>
              </svg>
            </button>
            <button class="grid-action-pill grid-action-edit" title="Edit SRAR">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"></path>
              </svg>
            </button>
          </div>
        `;
      },
    },
  ];

  // --- Step 1 Models ---
  // Zeroed, not seeded: the since-commissioning baseline is fetched per period (see
  // applySinceCommBaseline) and everything else is the user's own entry for the month.
  // The 100/250/"123.00"/"28.5" sample values this used to hold were real enough to be
  // saved as if someone had typed them.
  runningParameters: RunningParameters = {
    baselineSinceCommHours: 0,
    baselineSinceCommMinutes: 0,
    baselineSinceCommDistance: 0,
    duringMonthHours: 0,
    duringMonthMinutes: 0,
    duringMonthDistance: "0.00",
    sinceCommHours: "0:00",
    sinceCommDistance: "0.00",
    maxSpeedDuringMonth: "",
    maxSpeedDurationHours: 0,
    maxSpeedDurationMinutes: 0,
    maxSpeedDate: "",
    maxShaftRpm: ""
  };

  // Real ShipEquipment instances loaded from the backend — see loadRunningHoursEquipment(),
  // called from ngOnInit(). Previously a hardcoded per-ship sample list.
  equipments = signal<EquipmentItem[]>([]);

  // Tab 1's own saved rows (SrarEquipmentExploitation) carry no nomenclature/eqpt_code of
  // their own — only sfd_details + hours — so unlike the other equipment-driven tabs,
  // loadReportDetails() can't build a displayable row from saved data alone. It stashes
  // each saved row here (keyed by sfd_details) instead, and loadRunningHoursEquipment()'s
  // default-row builder overlays these values onto the fresh, correctly-named master row.
  private savedEquipmentHoursByShipEquipmentId = new Map<number, Record<string, unknown>>();

  // --- Step 2 Models ---
  // This ship carries no auxiliary boiler equipment — kept empty rather than seeded.
  boilerSteamingData: BoilerSteamingItem[] = [];

  alkalinityData: BoilerAlkalinityItem[] = [];

  // --- Step 3 Models ---
  activityFromDate = "";
  activityToDate = "";

  private _shipState = "";
  get shipState(): string {
    return this._shipState;
  }
  set shipState(val: string) {
    this._shipState = val;
    this.onShipStateChange(val);
  }

  private _shipLocation = "";
  get shipLocation(): string {
    return this._shipLocation;
  }
  set shipLocation(val: string) {
    this._shipLocation = val;
  }

  private _activityType = "";
  get activityType(): string {
    return this._activityType;
  }
  set activityType(val: string) {
    this._activityType = val;
    this.onActivityTypeChange(val);
  }

  activityDetail = "";
  activityRemarks = "";
  activityDisabledRanges: { from: string; to: string; }[] = [];

  shipStates: string[] = [
    "Material Ready",
    "Material Not Ready",
    "Ship Not Commissioned"
  ];
  shipLocations: string[] = [
    "At Sea",
    "Alongside Home Port",
    "Alongside Away From Home Port"
  ];
  activityTypes: string[] = [
    "Anchorage",
    "Independent Excercises",
    "Operational Excercises",
    "Operational Sea Training",
    "Sea Trials",
    "Special Duty",
    "Ship Not Commissioned"
  ];
  activityDetails: string[] = [
    "NA",
    "IDEF",
    "Tropex",
    "Operational Deployment",
    "Refit - Sea Trials",
    "OSD",
    "POG",
    "HADR"
  ];

  get shipStateOptions(): DropdownOption[] {
    return this.shipStates.map(st => ({ label: st, value: st }));
  }

  get shipLocationOptions(): DropdownOption[] {
    if (!this.shipState) return [];
    if (this.shipState === "Ship Not Commissioned") {
      return [{ label: "Alongside Home Port", value: "Alongside Home Port" }];
    }
    return this.shipLocations.map(loc => ({ label: loc, value: loc }));
  }

  get activityTypeOptions(): DropdownOption[] {
    if (!this.shipLocation) return [];
    if (this.shipState === "Ship Not Commissioned") {
      return [{ label: "Ship Not Commissioned", value: "Ship Not Commissioned" }];
    }
    return this.activityTypes
      .filter(act => act !== "Ship Not Commissioned")
      .map(act => ({ label: act, value: act }));
  }

  get activityDetailOptions(): DropdownOption[] {
    if (this.shipState === "Ship Not Commissioned") {
      return [{ label: "NA", value: "NA" }];
    }

    const type = (this.activityType || "").trim();
    if (!type) {
      return [];
    }

    const lowerType = type.toLowerCase();
    let allowedDetails: string[] = [];

    if (lowerType === "anchorage") {
      allowedDetails = ["NA"];
    } else if (lowerType.includes("independent")) {
      allowedDetails = ["IDEF"];
    } else if (lowerType.includes("operational excercises") || lowerType.includes("operational exercises")) {
      allowedDetails = ["Tropex", "Operational Deployment"];
    } else if (lowerType.includes("operational sea training")) {
      allowedDetails = ["NA"];
    } else if (lowerType.includes("sea trials")) {
      allowedDetails = ["Refit - Sea Trials"];
    } else if (lowerType.includes("special duty")) {
      allowedDetails = ["OSD", "POG", "HADR"];
    } else if (lowerType.includes("ship not commissioned")) {
      allowedDetails = ["NA"];
    } else {
      return this.activityDetails.map(det => ({ label: det, value: det }));
    }

    return allowedDetails.map(det => ({ label: det, value: det }));
  }

  public onShipStateChange(val: string): void {
    if (val === "Ship Not Commissioned") {
      this._shipLocation = "Alongside Home Port";
      this._activityType = "Ship Not Commissioned";
      this.activityDetail = "NA";
    } else if (this._activityType === "Ship Not Commissioned") {
      this._activityType = "";
      this.activityDetail = "";
    }
  }

  public onActivityTypeChange(val: string): void {
    const type = (val || "").trim().toLowerCase();
    if (type === "anchorage") {
      this.activityDetail = "NA";
    } else if (type.includes("independent")) {
      this.activityDetail = "IDEF";
    } else if (type.includes("operational sea training")) {
      this.activityDetail = "NA";
    } else if (type.includes("sea trials")) {
      this.activityDetail = "Refit - Sea Trials";
    } else if (type.includes("ship not commissioned")) {
      this.activityDetail = "NA";
    } else if (type.includes("operational excercises") || type.includes("operational exercises")) {
      const valid = ["Tropex", "Operational Deployment"];
      if (!valid.includes(this.activityDetail)) {
        this.activityDetail = "Tropex";
      }
    } else if (type.includes("special duty")) {
      const valid = ["OSD", "POG", "HADR"];
      if (!valid.includes(this.activityDetail)) {
        this.activityDetail = "OSD";
      }
    }
  }

  // Empty until loadReportDetails() fills it from the saved return (or the user adds
  // rows). This used to hold a sample "Area Alpha / EEZ Patrol" activity, which — since
  // constructCompositePayload sends whatever is in memory — was silently written into
  // every report that got saved.
  activities: ActivityItem[] = [];

  // --- Step 4 Models ---
  fuelConsumption = {
    bfLastMonth: "0",
    received: "0",
    consHarbor: "0",
    consAnchorage: "0",
    consSea: "0",
    totalCons: "0",
    defueled: "0",
    balLeftOnboard: "0"
  };

  avcatStatus = {
    bfLastMonth: "0",
    received: "0",
    givenToAc: "0",
    usedForTrials: "0",
    totalCons: "0",
    defueled: "0",
    balLeftOnboard: "0"
  };

  // Real equipment loaded from the backend by loadMasterEquipmentsFromBackend() — see
  // ngOnInit(). Previously a hardcoded per-ship sample list.
  torsionMeterData: TorsionMeterItem[] = [];

  // --- Step 5 Models ---
  iccpData: IccpItem[] = [];

  h2sSensorData: H2SSensorItem[] = [];

  stpData: StpItem[] = [];

  mffsData: MagazineItem[] = [];

  // --- Step 6 Models ---
  // The two kits are a fixed roster of rows (they have no ShipEquipment record behind
  // them, so nothing in the equipment master can add or remove them) — but whether a
  // given ship actually holds one is a declaration only the ship can make. The status
  // therefore starts *undeclared* rather than at "Ops": defaulting it to Ops asserted
  // that the ship holds an operational kit before anyone said so, and since Step 6 makes
  // calibration dates mandatory for an Ops kit, that default alone blocked "Submit to CO"
  // on every ship that carries no test kits. Blank means "nothing to report"; a ship that
  // does hold a kit picks Ops/Non-Ops/Not Held and then owes the calibration dates.
  lubOilCoolantTestKits: TestKitItem[] = SrarTransactionComponent.defaultTestKits();

  /** The fixed test-kit roster, rebuilt fresh so the reset path gets its own rows
   *  rather than sharing (and then mutating) the objects already on screen. */
  private static defaultTestKits(): TestKitItem[] {
    return [
      {
        description: "Water in Oil Test Kit",
        opsNonOps: "",
        nonOpsSince1: "",
        calibrationDate: "",
        nextCalibrationDueDate: "",
        nonOpsSince2: ""
      },
      {
        description: "TBN Test Kit",
        opsNonOps: "",
        nonOpsSince1: "",
        calibrationDate: "",
        nextCalibrationDueDate: "",
        nonOpsSince2: ""
      }
    ];
  }

  lubOilFuelCentrifuge: CentrifugeItem[] = [];

  // --- Step 7 Models ---
  // No live per-category backend source for these yet (unlike the tables above) — user
  // adds real rows via the Add Equipment/Routine/Major-Assembly pickers.
  safetyDeviceChecks: SafetyDeviceItem[] = [];

  injectorFipCalibration: InjectorFipItem[] = [];

  replacementMajorAssemblies: ReplacementItem[] = [];

  routinesUndertaken: RoutineItem[] = [];

  // --- Step 8 Models (DGUF) ---
  dgufGeneratorData: DgufGeneratorItem[] = [];

  dgufRunningHoursData = {
    totalRhSea: "00:00",
    hrsUnderway: "00:00",
    anchorage: "00:00",
    drifting: "00:00",
    hrsInHarbour: "00:00",
    hrsShoreSupply: "00:00",
    coldMoves: 0,
    comments: ""
  };

  dgufLimitingValues = {
    limitingValueSea: "",
    actualDgufSea: "",
    reasonExceedingSea: "",
    limitingValueHarbour: "",
    actualDgufHarbour: "",
    reasonExceedingHarbour: ""
  };

  dgufSeaReasonOptions: DropdownOption[] = [
    { label: "Operational Requirement", value: "1" },
    { label: "Unable to maintain power supply in single DG", value: "2" },
    { label: "To meet additional load", value: "3" },
    { label: "Within limit", value: "4" },
    { label: "Any other", value: "5" }
  ];

  dgufHarbourReasonOptions: DropdownOption[] = [
    { label: "Shore supply not available", value: "1" },
    { label: "Ship is at 3rd or 4th berthing position", value: "2" },
    { label: "Sea and Action checks", value: "3" },
    { label: "Machinery / Weapon Trials", value: "4" },
    { label: "Shore DG not available (for ANC ships)", value: "5" },
    { label: "Ship is at foreign port", value: "6" },
    { label: "Shore supply fluctuation", value: "7" },
    { label: "Duty ready ship", value: "8" },
    { label: "Cold Move", value: "9" },
    { label: "Within limit", value: "10" },
    { label: "Any other", value: "11" }
  ];

  /** Shore Supply Remarks options, from CMMS `DgufComment`. Empty until loaded; the
   *  picker falls back to the harbour reason list so the field is never unusable. */
  dgufCommentOptions: DropdownOption[] = [];

  get shoreSupplyRemarkOptions(): DropdownOption[] {
    return this.dgufCommentOptions.length
      ? this.dgufCommentOptions
      : this.dgufHarbourReasonOptions;
  }

  loadDgufComments(): void {
    this.srarService.getDgufComments().subscribe({
      next: (rows) => {
        this.dgufCommentOptions = (rows || []).map(row => ({
          label: row.label,
          value: row.value
        }));
      }
    });
  }

  // The DGUF Limiting Values table lives on Tab 8, but its figures are derived from
  // the per-generator R/H split entered on that same tab plus Tab 1 (hours underway),
  // and they are read back again on the Final Page summary. Recompute whenever Tab 8
  // is opened so neither readout goes stale — without this it would keep whatever was
  // last computed, which on a draft reopened before the R/H split is filled in is 0.00.
  private readonly dgufLimitingValuesSync = effect(() => {
    if (this.activeSubTab() !== 8) return;
    this.recalculateDgufGeneratorTotals();
    this.recalculateDgufSeaHarbourSplit();
  });

  // --- Step 9 Models (Full Power Trials) ---
  fptMainEngineGeneral = {
    lastFptDate: "",
    displacement: "",
    maxSpeed: "",
    occasionReason: "",
    draughtFwd: "",
    draughtAft: "",
    conductedBy: "",
    torsionMotorReading: "",
    seaState: "",
    remarks: ""
  };

  // Populated live from CMMS (Ch_Master_Full_Power_Conducted_By) — see loadConductedByOptions()
  fptConductedByOptions: DropdownOption[] = [];

  /** Step 13 "On Routine" choices — the hour-based rows of the Frequency master
   *  (100H, 500H, 1000H, ...), which is what CMMS's own SRAR form offers there and what
   *  RHExtension.on_routine is a foreign key to. Loaded by loadMetadata(). */
  routineHourOptions: SrarRoutineHourOption[] = [];

  seaStateOptions: DropdownOption[] = [
    { label: "1", value: "1" },
    { label: "2", value: "2" },
    { label: "3", value: "3" },
    { label: "4", value: "4" },
    { label: "5", value: "5" }
  ];

  // Real equipment loaded from the backend by loadMasterEquipmentsFromBackend() — see
  // ngOnInit(). Previously a hardcoded per-ship sample list.
  fptMainEngineSpecific: FptMainEngineSpecificItem[] = [];

  fptDieselGeneratorLoad: FptDieselGeneratorLoadItem[] = [];

  // --- Step 10 Models (Gas Turbine / RG Exploitation) ---
  gasTurbineExploitation: GasTurbineExploitationItem[] = [];

  gtReductionGear: GtReductionGearItem[] = [];

  // Tab 7: the main diesel engine's reduction gear (CMMS equipment category 4,
  // "Reduction Gear"). Distinct from gtReductionGear above, which is the
  // gas-turbine reduction gear on Tab 10 (category 35).
  dieselReductionGear: DieselReductionGearItem[] = [];

  // No live per-category backend source for these yet — user adds real rows via the
  // Add Routine/Major-Assembly pickers.
  gtReplacementMajorAssemblies: ReplacementItem[] = [];

  gtRoutinesUndertaken: RoutineItem[] = [];

  // --- Step 11 Models (GTG Exploitation) ---
  // Real equipment loaded from the backend by loadMasterEquipmentsFromBackend().
  gtgExploitationData: GtgExploitationItem[] = [];

  // No live per-category backend source for these yet.
  gtgReductionGear: GtgReductionGearItem[] = [];

  gtgReplacementMajorAssemblies: ReplacementItem[] = [];

  gtgRoutinesUndertaken: RoutineItem[] = [];

  // --- Step 12 Models (Lubricants) ---
  // Empty until loadReportDetails() fills it from the saved return — the O-156/OMD-113
  // sample rows this used to hold were written into every saved report.
  lubricantData: LubItem[] = [];

  lubricantUnits: string[] = [];

  /**
   * The unit master, plus any unit a row already carries that isn't in it.
   *
   * app-select-input displays nothing for a value absent from its options, so a lubricant
   * whose CMMS unit the master doesn't know (CMMS holds a few one-off codes normalize_
   * lubricant_unit deliberately leaves alone) would look blank even though the row holds
   * a real unit — and the operator would retype a unit that was already there. Carrying
   * the in-use values into the options keeps what was filled in visible.
   */
  get lubricantUnitOptions(): DropdownOption[] {
    const units = [...this.lubricantUnits];
    for (const lub of this.lubricantData) {
      const unit = String(lub.unit ?? "").trim();
      if (unit && !units.includes(unit)) units.push(unit);
    }
    return units.map(u => ({ label: u, value: u }));
  }

  // --- Step 13 Models (RH Extension) ---
  // No live per-category backend source for these yet — user adds real rows manually.
  mainEngineRHExtensions: RhExtensionItem[] = [];

  dieselAlternatorRHExtensions: RhExtensionItem[] = [];

  // --- Step 14 Models (EO Remark / EEF) ---
  eefData: {
    hoursUnderway: string;
    designed: number | null;
    reasonExceeding: string;
    shipRemarks: string;
  } = {
      hoursUnderway: "",
      designed: null,
      reasonExceeding: "",
      shipRemarks: ""
    };

  eefReasons: string[] = [];

  get eefReasonOptions(): DropdownOption[] {
    return this.eefReasons.map(r => ({ label: r, value: r }));
  }

  // --- Popup Modals State ---
  showAddEquipmentModal = false;
  showAddRoutineModal = false;
  showAddMajorAssemblyModal = false;

  newEquipmentType = {
    selectEquipment: "",
    systemEquipment: "",
    date: "",
    qty: "",
    reason: "",
    remarks: ""
  };

  newRoutine = {
    equipment: "",
    routineName: "",
    description: "",
    date: "",
    undertakenBy: ""
  };

  newMajorAssembly = {
    equipment: "",
    date: "",
    unit: "",
    reason: "",
    remarks: ""
  };

  // Type-of-Equipment options for the Add Equipment/Routine/Major-Assembly modals,
  // loaded from the same CMMS-backed Ch_Master_Equipment_Type list SRAR Masters uses
  // (see loadEquipmentTypeOptions()). [allowCustomValue] on their <app-select-input>
  // is kept as a fallback for equipment not yet in that master list.
  equipmentOptions: DropdownOption[] = [];

  get routineEquipmentOptions(): DropdownOption[] {
    return this.equipmentOptions;
  }

  get majorAssemblyEquipmentOptions(): DropdownOption[] {
    return this.equipmentOptions;
  }

  routineNameOptions: DropdownOption[] = [
    { label: "Annual Routine", value: "Annual Routine" },
    { label: "SR Routine", value: "SR Routine" },
    { label: "MR Routine", value: "MR Routine" }
  ];

  routineUndertakenByOptions: DropdownOption[] = [
    { label: "Ship staff", value: "Ship staff" },
    { label: "Trial team", value: "Trial team" },
    { label: "OEM", value: "OEM" }
  ];

  ngOnInit() {
    this.loadDashboard();
    this.route.queryParams.subscribe((params) => {
      if (params["step"]) {
        this.activeSubTab.set(Number(params["step"]) || 15);
      }
      if (params["id"]) {
        this.srarId = +params["id"];
        this.loadReportDetails(this.srarId);
      } else {
        this.loadCarryForwardData();
        this.loadMasterEquipmentsFromBackend();
        this.loadRunningHoursEquipment();
      }
    });
    this.loadMetadata();
    this.updateDisabledRanges();
    this.loadConductedByOptions();
    this.loadEquipmentTypeOptions();
    this.loadEefDesignedValue();
    this.loadCmmsLubricants();
    this.loadDgufComments();
  }

  // Type-of-Equipment options for the Add Equipment/Routine/Major-Assembly modals —
  // the same CMMS Ch_Master_Equipment_Type master list SRAR Masters uses.
  loadEquipmentTypeOptions(): void {
    this.srarService.getMasterEquipmentsOnly().subscribe({
      next: (data) => {
        if (!Array.isArray(data)) return;
        this.equipmentOptions = data
          .map((item): DropdownOption => ({
            label: String(item["equipment_desc"] || item["name"] || "").trim(),
            value: String(item["equipment_desc"] || item["name"] || "").trim()
          }))
          .filter(option => option.label);
      },
      error: (err: unknown) => console.error("Failed to load equipment type options:", err)
    });
  }

  // CMMS-backed "Conducted By"/"Trial Conducted By" options, shared across every
  // occurrence of this field in the SRAR forms (SDC, FPT Main Engine, FPT Diesel
  // Alternators, RH Extension).
  loadConductedByOptions(): void {
    this.srarService.getConductedByOptions().subscribe({
      next: (data) => {
        this.fptConductedByOptions = data.map(item => ({ label: item.label, value: item.value }));
      }
    });
  }

  // CMMS-backed lubricant picker (name + unit) for the Add Lubricant modal.
  cmmsLubricantOptions: DropdownOption[] = [];
  cmmsLubricants: { id: string; label: string; value: string; name: string; unit: string; type: string }[] = [];
  loadCmmsLubricants(): void {
    this.srarService.getCmmsLubricants().subscribe({
      next: (data) => {
        this.cmmsLubricants = data;
        this.cmmsLubricantOptions = data.map(item => ({ label: item.label, value: item.value }));
      }
    });
  }

  // CMMS-backed "Designed EEF" value for the ship's class — replaces the previously
  // hardcoded frontend constant. Read-only: it's a ship-class spec value, not
  // something entered per month.
  loadEefDesignedValue(): void {
    this.srarService.getEefDesignedValue().subscribe({
      next: (data) => {
        if (data.designed_eef !== null && data.designed_eef !== undefined) {
          this.eefData.designed = data.designed_eef;
          // Tab 8's "Limiting Value (Sea)" is that same ship-class figure from
          // M_ShipClassEEF — it is the limit the month's actual DGUF is judged against.
          // The field is readonly and had nothing filling it, so it read as blank on
          // every return while the reason-for-exceeding picker sat next to it.
          this.dgufLimitingValues.limitingValueSea = String(data.designed_eef);
        }
      }
    });
  }

  onSelectedMonthChange(value: string): void {
    this.selectedMonth.set(value);
    if (!this.srarId) {
      this.loadCarryForwardData();
    }
  }

  onSelectedYearChange(value: number): void {
    this.selectedYear.set(value);
    if (!this.srarId) {
      this.loadCarryForwardData();
    }
  }

  // Fetches carry-forward values (fuel/AVCAT balance, R/H since installation) from the
  // previous month's SRAR and seeds this month's defaults from them. Only applies to a
  // brand-new (unsaved) report — an existing report's own saved values always win.
  loadCarryForwardData(): void {
    const month = this.getMonthNumber(this.selectedMonth());
    const year = this.selectedYear();
    this.srarService.getCarryForward(this.shipId, month, year).subscribe({
      next: (data) => {
        this.carryForward = data;
        this.fuelConsumption.bfLastMonth = String(data.fuel_balance_last_month ?? 0);
        this.avcatStatus.bfLastMonth = String(data.avcat_balance_last_month ?? 0);
        this.applySinceCommBaseline(
          Number(data.since_commissioning_hours_last_month_hr ?? 0) || 0,
          Number(data.since_commissioning_hours_last_month_min ?? 0) || 0,
          Number(data.since_commissioning_distance_last_month ?? 0) || 0
        );
        this.calculateFuelConsumption();
        this.calculateAvcatStatus();
        this.applyEquipmentHoursCarryForward();
        this.applyInjectorFipCarryForward();
        this.applyGasTurbineCarryForward();
        this.applyReductionGearCarryForward();
        this.applyDieselReductionGearCarryForward();
        this.applyGtgCarryForward();
        this.applyGtgReductionGearCarryForward();
        this.applyFptMainEngineCarryForward();
        this.applyRhExtensionCarryForward();
        this.loadEquipmentRoutineOptions();
      }
    });
  }

  // Matches a carry-forward row to this month's equipment row, by ShipEquipment id
  // first and only then by eqpt_code / eqpt_name.
  //
  // The id is the only reliable key: these tabs' `eqptCode` values are generated
  // client-side for display ("ME-01", "DA-03" — see loadMasterEquipmentsFromBackend),
  // so they never equal anything the backend stores, and matching on them alone meant
  // any row whose name also differed silently found nothing. Every row now carries
  // `shipEquipmentId` (set by reconcileEquipmentRows), which is exactly what the
  // backend keys `sfd_details` on.
  private findCarryForwardByEquipment<
    T extends { sfd_details?: number | null; eqpt_code: string | null; eqpt_name: string | null }
  >(
    list: T[] | undefined,
    eqptCode: string | undefined | null,
    eqptName: string | undefined | null,
    shipEquipmentId?: number
  ): T | undefined {
    if (!list?.length) return undefined;
    if (typeof shipEquipmentId === "number") {
      const byId = list.find(row => row.sfd_details === shipEquipmentId);
      if (byId) return byId;
    }
    const code = String(eqptCode || "").trim().toLowerCase();
    const name = String(eqptName || "").trim().toLowerCase();
    if (code) {
      const byCode = list.find(row => String(row.eqpt_code || "").trim().toLowerCase() === code);
      if (byCode) return byCode;
    }
    if (name) {
      return list.find(row => String(row.eqpt_name || "").trim().toLowerCase() === name);
    }
    return undefined;
  }

  loadDashboard() {
    this.srarService.getDashboard().subscribe({
      next: (data: SrarRecord[]) => {
        const records = Array.isArray(data) ? data : [];
        const formatted: SrarRecord[] = records.map((item) => {
          const raw = item as unknown as Record<string, unknown>;
          const isSynced = Boolean(raw["cmms_sync_status"] ?? raw["cmmsSyncStatus"] ?? false);
          const isSentToCo = Boolean(raw["send_to_co"] ?? false);
          const isCoApproved = Boolean(raw["co_approved"] ?? false);
          const approvalStatus = String(
            raw["status"] || raw["approvalStatus"] || (
              isSynced
                ? "CMMS Synced"
                : isCoApproved
                  ? "CO Approved & CMMS Sync Pending"
                  : isSentToCo
                    ? "Sent to CO Approval"
                    : "Draft"
            )
          );
          return {
            id: String(item["id"] || ""),
            srarNo: String(item["srarNo"] || `SRAR/${item["year"] || 2026}/${String(item["month"] || 8).padStart(2, "0")}/${String(item["id"]).padStart(3, "0")}`),
            shipName: String(item["shipName"] || ""),
            month: String(item["month"] || "August"),
            year: Number(item["year"] || 2026),
            submissionDate: String(item["submissionDate"] || new Date().toISOString().split("T")[0]),
            approvalStatus,
            engineerOfficer: String(item["engineerOfficer"] || "N/A"),
            cmms_sync_status: isSynced,
            cmmsSyncStatus: isSynced,
            send_to_co: isSentToCo,
            co_approved: isCoApproved,
            is_saved: Boolean(raw["is_saved"] ?? false)
          };
        });
        this.records.set(formatted);
        this.applyNextAvailablePeriod();
      },
      error: (err: unknown) => {
        console.error("Failed to load SRAR dashboard:", err);
        this.records.set([]);
      }
    });
  }

  // The month/year dropdown for "Fill SRAR Detail" always used to default to whatever
  // was hardcoded at page load (see the selectedMonth/selectedYear signal initializers)
  // regardless of how many periods had already been filed — so a ship on its 5th return
  // still had to be manually stepped forward from that fixed default. Once the record
  // list is in, default it to the period right after the latest one on file instead.
  // Skipped while a report is open (srarId set) or mid-form (showDetails) so it never
  // clobbers a period the user is actively working with.
  private applyNextAvailablePeriod(): void {
    if (this.srarId || this.showDetails()) return;
    const latest = this.records().reduce<{ month: number; year: number } | null>((acc, record) => {
      const year = Number(record.year);
      const month = this.getMonthNumber(record.month);
      if (!Number.isFinite(year) || !month) return acc;
      if (!acc || year > acc.year || (year === acc.year && month > acc.month)) {
        return { month, year };
      }
      return acc;
    }, null);
    if (!latest) return;
    let nextMonth = latest.month + 1;
    let nextYear = latest.year;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }

    // Never step past the month we are actually in. A SRAR reports on a month that has
    // happened, so "the month after the latest return on file" is only the right default
    // while the returns are behind today — with a return already filed for the current
    // month (or a later one, which the CMMS pull can bring down), this walked the whole
    // page into the future: the selector, the hours ceiling, the date guards and the
    // "Starting CMMS sync for <month>" line all named a month nobody can report on yet.
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    if (nextYear > currentYear || (nextYear === currentYear && nextMonth > currentMonth)) {
      nextMonth = currentMonth;
      nextYear = currentYear;
    }

    this.selectedMonth.set(this.months[nextMonth - 1]);
    this.selectedYear.set(nextYear);
  }
  // --- CMMS sync progress popup ---
  // The pull covers this ship's whole SRAR history in one long-running request with
  // no feedback until it finished (or the browser gave up waiting) — see
  // SrarService.streamSyncSrarWithCmms. This drives a popup progress bar + log
  // instead, fed by the backend's tagged log lines ([STEP n/5], [OK], [NEW],
  // [EXISTING], [SKIPPED], [FATAL], [Completed]).
  cmmsSyncModalOpen = signal(false);
  cmmsSyncRunning = signal(false);
  cmmsSyncFailed = signal(false);
  cmmsSyncProgress = signal(0);
  cmmsSyncStepIndex = signal(0);
  cmmsSyncStepTotal = signal(5);
  cmmsSyncStepLabel = signal("Starting sync...");
  cmmsSyncLog = signal<CmmsSyncLogLine[]>([]);

  syncWithCMMS(row?: SrarRecord) {
    const month = String(row?.month_name ?? row?.month ?? this.selectedMonth());
    const year = Number(row?.year ?? this.selectedYear());
    this.runCmmsSync(month, year);
  }

  /** True while a push to CMMS is in flight, so the grid's sync button can't be
   *  double-fired (the push is a long request and gives no feedback of its own). */
  isPushingToCmms = signal(false);

  /**
   * Pushes one CO-approved return up to CMMS. This is what the grid's sync button
   * means — it only unlocks after CO approval, and the whole point of that gate is to
   * send the approved return to CMMS.
   *
   * It used to call syncWithCMMS(row), i.e. `runCmmsSync` → the 5-step
   * srar_pull_from_cmms stream — the *opposite* direction. So clicking it opened the
   * "Refreshing equipment masters from CMMS..." progress popup and pulled CMMS data
   * down over SWMM instead of pushing the return that had just been approved.
   */
  pushApprovedReportToCmms(row: SrarRecord | undefined): void {
    if (this.isPushingToCmms()) return;

    const month = row?.month ?? row?.month_name ?? this.selectedMonth();
    const year = Number(row?.year ?? this.selectedYear());
    if (!month || !year) {
      this.appService.openAlert("Sync Error", "Could not determine which month to push to CMMS.");
      return;
    }

    this.isPushingToCmms.set(true);
    this.gridApi?.refreshCells({ force: true });

    this.srarService.pushSrarToCmms(month, year).subscribe({
      next: (res) => {
        this.isPushingToCmms.set(false);
        // This endpoint reports failure as `status: false` in a 200 body, so a plain
        // next-handler success toast would announce failed pushes as successes.
        if (res && res["status"] === false) {
          this.appService.openAlert("Sync Failed", String(res["message"] || "CMMS rejected the SRAR push."));
          this.loadDashboard();
          return;
        }
        this.toaster.success(`SRAR pushed to CMMS for ${month} ${year}.`);
        this.loadDashboard();
      },
      error: (err: HttpErrorLike) => {
        this.isPushingToCmms.set(false);
        const msg = err?.error?.message || err?.message || "Unable to push SRAR to CMMS.";
        this.appService.openAlert("Sync Failed", msg);
        this.gridApi?.refreshCells({ force: true });
      }
    });
  }

  private runCmmsSync(month: string, year: number): void {
    if (this.cmmsSyncRunning()) return;

    this.cmmsSyncModalOpen.set(true);
    this.cmmsSyncRunning.set(true);
    this.cmmsSyncFailed.set(false);
    this.cmmsSyncProgress.set(0);
    this.cmmsSyncStepIndex.set(0);
    this.cmmsSyncStepTotal.set(5);
    this.cmmsSyncStepLabel.set("Starting sync...");
    this.cmmsSyncLog.set([{ text: `Starting CMMS sync for ${month} ${year}...`, tone: "info" }]);

    let buffer = "";
    const appendLine = (raw: string) => this.appendCmmsSyncLine(raw);

    this.srarService.streamSyncSrarWithCmms(month, year, (chunk) => {
      buffer += chunk;
      const parts = buffer.split(/\r?\n/);
      buffer = parts.pop() ?? "";
      parts.forEach(appendLine);
    }).then(() => {
      if (buffer.trim()) appendLine(buffer);
      this.cmmsSyncRunning.set(false);
      if (this.cmmsSyncFailed()) {
        this.toaster.error("SRAR CMMS sync failed — see details in the popup.");
        return;
      }
      this.cmmsSyncProgress.set(100);
      this.loadDashboard();
      this.loadMasterEquipmentsFromBackend();
      this.toaster.success(`SRAR sync completed for ${month} ${year}.`);
    }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : "Unable to connect to CMMS API.";
      appendLine(`[FATAL] ${msg}`);
      this.cmmsSyncRunning.set(false);
      this.toaster.error(msg);
    });
  }

  private appendCmmsSyncLine(raw: string): void {
    const line = raw.trim();
    if (!line) return;

    const stepMatch = /^\[STEP (\d+)\/(\d+)]\s*(.*)$/.exec(line);
    if (stepMatch) {
      const stepIndex = Number(stepMatch[1]);
      const stepTotal = Number(stepMatch[2]) || 5;
      this.cmmsSyncStepIndex.set(stepIndex);
      this.cmmsSyncStepTotal.set(stepTotal);
      this.cmmsSyncStepLabel.set(stepMatch[3] || `Step ${stepIndex} of ${stepTotal}`);
      this.cmmsSyncProgress.set(Math.round(((stepIndex - 1) / stepTotal) * 100));
    }

    let tone: CmmsSyncLogLine["tone"] = "info";
    if (/^\[Completed]/i.test(line)) {
      tone = "success";
      this.cmmsSyncProgress.set(100);
    } else if (/^\[FATAL]/i.test(line)) {
      tone = "error";
      this.cmmsSyncFailed.set(true);
    } else if (/^\[(OK|NEW)]/i.test(line)) {
      tone = "success";
    } else if (/^\[EXISTING]/i.test(line)) {
      tone = "update";
    } else if (/^\[SKIPPED]/i.test(line)) {
      tone = "skipped";
    }

    this.cmmsSyncLog.update((lines) => [...lines, { text: line, tone }]);
  }

  closeCmmsSyncModal(): void {
    if (this.cmmsSyncRunning()) return;
    this.cmmsSyncModalOpen.set(false);
  }





  exportSrarReport(record?: SrarRecord) {
    if (this.isExporting()) return;
    this.setExportingState(true);

    const idToExport = record?.id ?? this.srarId ?? 3;
    this.srarService.exportSrarReport(idToExport).subscribe({
      next: (res) => {
        this.handleSrarExportResponse(res, idToExport);
      },
      error: (err: unknown) => {
        console.error("Failed to export SRAR report:", err);
        const errorMessage = (err as { error?: { message?: string }; message?: string })?.error?.message
          || (err as Error).message
          || `Failed to export SRAR Report (ID #${idToExport})`;
        this.toaster.error(errorMessage);
        this.setExportingState(false);
      }
    });
  }

  private handleSrarExportResponse(res: Record<string, unknown>, idToExport: number | string): void {
    const downloadUrl = typeof res["download_url"] === "string" ? res["download_url"] : "";
    const filename = typeof res["filename"] === "string" && res["filename"]
      ? res["filename"]
      : `SRAR_${idToExport}.accdb`;

    if (downloadUrl) {
      this.downloadSrarAccdb(downloadUrl, filename);
      return;
    }

    const taskStatusUrl = typeof res["task_status_url"] === "string" ? res["task_status_url"] : "";
    if (taskStatusUrl) {
      this.pollSrarExportTask(taskStatusUrl, idToExport, 0);
      return;
    }

    this.toaster.error("Export response did not include a download URL.");
    this.setExportingState(false);
  }

  private pollSrarExportTask(taskStatusUrl: string, idToExport: number | string, attempt: number): void {
    if (attempt >= 20) {
      this.toaster.error("SRAR ACCDB export is taking longer than expected.");
      this.setExportingState(false);
      return;
    }

    window.setTimeout(() => {
      this.srarService.getExportTaskStatus(taskStatusUrl).subscribe({
        next: (statusRes) => {
          const taskStatus = String(statusRes["status"] || "").toUpperCase();
          if (taskStatus === "FAILURE") {
            this.toaster.error("SRAR ACCDB export failed.");
            this.setExportingState(false);
            return;
          }

          const result = statusRes["result"] as Record<string, unknown> | undefined;
          const exportResult = result?.["result"] as Record<string, unknown> | undefined;
          const downloadUrl = typeof exportResult?.["download_url"] === "string" ? exportResult["download_url"] : "";
          const filename = typeof exportResult?.["filename"] === "string" && exportResult["filename"]
            ? exportResult["filename"]
            : `SRAR_${idToExport}.accdb`;

          if (downloadUrl) {
            this.downloadSrarAccdb(downloadUrl, filename);
            return;
          }

          this.pollSrarExportTask(taskStatusUrl, idToExport, attempt + 1);
        },
        error: () => {
          this.toaster.error("Failed to check SRAR ACCDB export status.");
          this.setExportingState(false);
        }
      });
    }, 1500);
  }

  private downloadSrarAccdb(downloadUrl: string, filename: string): void {
    this.srarService.downloadFileBlob(downloadUrl).subscribe({
      next: (blob) => {
        this.triggerBlobDownload(blob, filename);
        this.toaster.success(`SRAR exported successfully as ${filename}`);
        this.setExportingState(false);
      },
      error: () => {
        this.toaster.error("Failed to download SRAR ACCDB file.");
        this.setExportingState(false);
      }
    });
  }

  openSrarPdfWindow(data: Record<string, unknown>): void {
    try {
      const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
      ];
      const header = (data["header"] || {}) as Record<string, unknown>;
      const monthNum = Number(header["srar_month"] || 8);
      const monthName = MONTH_NAMES[monthNum - 1] || "August";
      const year = header["srar_year"] || 2026;
      const reportId = header["id"] || 2;

      const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 24;

      // Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.rect(0, 0, pageWidth, 42, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(255, 255, 255);
      doc.text("INDIAN NAVY — SHIP RETURNS", pageWidth / 2, 26, { align: "center" });

      doc.setFontSize(12);
      doc.setTextColor(2, 132, 199); // sky-600
      doc.text("SHIP RUNNING AND ANALYSIS RETURN (SRAR)", pageWidth / 2, 58, { align: "center" });

      let currentY = 74;

      // Metadata Table
      const metadataRows = [
        [
          { content: "SRAR Period:", styles: { fontStyle: "bold" as const } },
          `${monthName} ${year}`,
          { content: "Report ID:", styles: { fontStyle: "bold" as const } },
          `SRAR/${year}/${String(monthNum).padStart(2, '0')}/${String(reportId).padStart(3, '0')}`
        ],
        [
          { content: "Distance Run (Month):", styles: { fontStyle: "bold" as const } },
          `${this.formatVal(header["distance_run_month"])} NM`,
          { content: "Max Speed Date:", styles: { fontStyle: "bold" as const } },
          this.formatVal(header["max_speed_date"])
        ],
        [
          { content: "Max Speed:", styles: { fontStyle: "bold" as const } },
          `${this.formatVal(header["max_speed"])} Knots`,
          { content: "Max Shaft RPM:", styles: { fontStyle: "bold" as const } },
          this.formatVal(header["max_shaft_rpm"])
        ],
        [
          { content: "Engineer Officer:", styles: { fontStyle: "bold" as const } },
          `${this.formatVal(header["eo_name"])} (${this.formatVal(header["eo_rank"])})`,
          { content: "EO Contact:", styles: { fontStyle: "bold" as const } },
          this.formatVal(header["eo_contact_no"])
        ]
      ];

      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        body: metadataRows,
        theme: "plain",
        styles: { fontSize: 9, cellPadding: 4, textColor: [15, 23, 42] },
        columnStyles: {
          0: { cellWidth: 120, textColor: [100, 116, 139] },
          1: { cellWidth: 150 },
          2: { cellWidth: 110, textColor: [100, 116, 139] },
          3: { cellWidth: 160 }
        }
      });

      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      const addSectionHeader = (title: string) => {
        if (currentY > pageHeight - 60) {
          doc.addPage();
          currentY = 40;
        }
        doc.setFillColor(226, 232, 240); // slate-200
        doc.rect(margin, currentY, pageWidth - (margin * 2), 20, "F");
        doc.setFillColor(2, 132, 199); // sky-600 accent bar
        doc.rect(margin, currentY, 4, 20, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        doc.text(title.toUpperCase(), margin + 10, currentY + 14);
        currentY += 24;
      };

      // Table 1: Equipment Exploitation
      const tab1 = (data["tab_1_equipment_exploitations"] || []) as Record<string, unknown>[];
      addSectionHeader("1. Equipment Exploitation & Running Hours");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Item ID", "Hours for Month", "RHSI Current Month"]],
        body: tab1.length > 0 ? tab1.map(item => [
          this.formatVal(item["id"]),
          `${this.formatVal(item["hrs_for_month_hrs"])} hrs ${this.formatVal(item["hrs_for_month_min"])} mins`,
          `${this.formatVal(item["rhsi_till_current_month"])} hrs`
        ]) : [["No equipment records found", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 2: Boiler Steaming
      const tab2 = (data["tab_2_boiler_data"] || []) as Record<string, unknown>[];
      addSectionHeader("2. Boiler Steaming Details");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Boiler Name", "Serial No", "Hrs Steamed in Month", "Hrs Steamed Since Comm.", "Hrs Above 20%"]],
        body: tab2.length > 0 ? tab2.map(item => [
          this.formatVal(item["name"]),
          this.formatVal(item["serial_no"]),
          this.formatVal(item["hrs_steamed_in_month"]),
          this.formatVal(item["hrs_steamed_since_commissioning"]),
          this.formatVal(item["hrs_above_20_percent"])
        ]) : [["No boiler records found", "", "", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 3: Ship Activities
      const tab3 = (data["tab_3_ship_activities"] || []) as Record<string, unknown>[];
      addSectionHeader("3. Ship Activities & State");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["From Date", "To Date", "Ship State", "Location", "Activity Type", "Remarks"]],
        body: tab3.length > 0 ? tab3.map(item => [
          this.formatVal(item["from_date"]),
          this.formatVal(item["to_date"]),
          this.formatVal(item["ship_state"]),
          this.formatVal(item["ship_location"]),
          this.formatVal(item["ship_activity_type"]),
          this.formatVal(item["remarks"])
        ]) : [["No ship activities found", "", "", "", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 4: Fuel Consumption
      const tab4Fuel = (data["tab_4_fuel_consumptions"] || []) as Record<string, unknown>[];
      addSectionHeader("4. Fuel & AVCAT Consumption");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["B/F Last Month", "Received", "Harbour Cons.", "Sea Cons.", "Total Cons.", "Balance Onboard"]],
        body: tab4Fuel.length > 0 ? tab4Fuel.map(item => [
          this.formatVal(item["b_f_from_last_month"]),
          this.formatVal(item["recieved"]),
          this.formatVal(item["consumed_in_harbour"]),
          this.formatVal(item["consumed_at_sea"]),
          this.formatVal(item["total_consumed"]),
          this.formatVal(item["balance_left_on_board"])
        ]) : [["No fuel consumption records found", "", "", "", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 5: ICCP & Gas Detection
      const tab5Iccp = (data["tab_5_iccp"] || []) as Record<string, unknown>[];
      addSectionHeader("5. ICCP & Gas Detection System");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Nomenclature", "Location Onboard", "Status"]],
        body: tab5Iccp.length > 0 ? tab5Iccp.map(item => [
          this.formatVal(item["nomenclature"]),
          this.formatVal(item["loc_on_board"]),
          this.formatVal(item["ops_or_non_ops"]) || "Operational"
        ]) : [["No ICCP records found", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 6: Test Kits
      const tab6Kits = (data["tab_6_test_kits"] || []) as Record<string, unknown>[];
      addSectionHeader("6. Test Kits & Calibration");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Description", "Next Calibration Due Date"]],
        body: tab6Kits.length > 0 ? tab6Kits.map(item => [
          this.formatVal(item["description"]),
          this.formatVal(item["next_calibration_due_date"])
        ]) : [["No test kit records found", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 7: Safety Device Checks
      const tab7Sdc = (data["tab_7_safety_device_checks"] || []) as Record<string, unknown>[];
      addSectionHeader("7. Safety Device Checks (SDC)");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Equipment Name", "Location", "Date of SDC", "Last SFC Trial Date"]],
        body: tab7Sdc.length > 0 ? tab7Sdc.map(item => [
          this.formatVal(item["eqpt_name"]),
          this.formatVal(item["loc_on_board"]),
          this.formatVal(item["date_of_sdc"]),
          this.formatVal(item["last_sfc_trial_date"])
        ]) : [["No SDC records found", "", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Table 12: Lubricants
      const tab12Lub = (data["tab_12_lubricants"] || []) as Record<string, unknown>[];
      addSectionHeader("12. Lubricant Consumption");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        head: [["Lubricant Name", "Quantity", "Unit"]],
        body: tab12Lub.length > 0 ? tab12Lub.map(item => [
          this.formatVal(item["name"]),
          this.formatVal(item["quantity"]),
          this.formatVal(item["unit"])
        ]) : [["No lubricant records found", "", ""]],
        headStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold", fontSize: 9 },
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

      // Section 14: EEF
      const tab14Eef = (data["tab_14_eef"] || {}) as Record<string, unknown>;
      addSectionHeader("14. EO Remarks & Energy Efficiency Factor (EEF)");
      autoTable(doc, {
        startY: currentY,
        margin: { left: margin, right: margin },
        body: [
          [{ content: "Designed EEF:", styles: { fontStyle: "bold" as const, cellWidth: 140 } }, this.formatVal(tab14Eef["designed"])],
          [{ content: "Reason for Exceeding:", styles: { fontStyle: "bold" as const, cellWidth: 140 } }, this.formatVal(tab14Eef["reason_for_exceeding"])],
          [{ content: "Ship Remarks:", styles: { fontStyle: "bold" as const, cellWidth: 140 } }, this.formatVal(tab14Eef["ship_remarks"])]
        ],
        theme: "plain",
        styles: { fontSize: 8.5, cellPadding: 5 }
      });
      currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 30;

      // Signature Box
      if (currentY > pageHeight - 60) {
        doc.addPage();
        currentY = 50;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);
      doc.text("_____________________________", margin, currentY);
      doc.text("Engineer Officer Sign & Date", margin, currentY + 14);

      doc.text("_____________________________", pageWidth - margin - 150, currentY);
      doc.text("Commanding Officer Sign & Date", pageWidth - margin - 150, currentY + 14);

      // Add Page Numbers Footer to all pages
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184); // slate-400
        doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, pageHeight - 15, { align: "center" });
      }

      // Save PDF
      const filename = `SRAR_Report_${monthName}_${year}.pdf`;
      doc.save(filename);
      this.toaster.success(`PDF downloaded successfully as ${filename}`);
    } catch (e) {
      console.error("Failed to generate/download PDF with jsPDF:", e);
      this.toaster.error("Failed to download PDF. Please try again.");
    } finally {
      this.setExportingState(false);
    }
  }

  private formatVal(v: unknown): string {
    return v !== null && v !== undefined && v !== "" ? String(v) : "N/A";
  }

  private renderTableRows<T>(
    items: T[],
    renderRow: (item: T) => string,
    colSpan: number,
    emptyMessage: string
  ): string {
    if (!items || items.length === 0) {
      return `<tr><td colspan="${colSpan}" style="text-align:center;">${emptyMessage}</td></tr>`;
    }
    return items.map(renderRow).join('');
  }

  renderSrarPdfHtml(data: Record<string, unknown>): string {
    const MONTH_NAMES = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const header = (data["header"] || {}) as Record<string, unknown>;
    const monthNum = Number(header["srar_month"] || 8);
    const monthName = MONTH_NAMES[monthNum - 1] || "August";
    const year = header["srar_year"] || 2026;
    const reportId = header["id"] || 2;

    const tab1 = (data["tab_1_equipment_exploitations"] || []) as Record<string, unknown>[];
    const tab2 = (data["tab_2_boiler_data"] || []) as Record<string, unknown>[];
    const tab3 = (data["tab_3_ship_activities"] || []) as Record<string, unknown>[];
    const tab4Fuel = (data["tab_4_fuel_consumptions"] || []) as Record<string, unknown>[];
    const tab5Iccp = (data["tab_5_iccp"] || []) as Record<string, unknown>[];
    const tab6Kits = (data["tab_6_test_kits"] || []) as Record<string, unknown>[];
    const tab7Sdc = (data["tab_7_safety_device_checks"] || []) as Record<string, unknown>[];
    const tab12Lub = (data["tab_12_lubricants"] || []) as Record<string, unknown>[];
    const tab14Eef = (data["tab_14_eef"] || {}) as Record<string, unknown>;

    const tab1Rows = this.renderTableRows(tab1, item => `<tr>
          <td>${this.formatVal(item["id"])}</td>
          <td>${this.formatVal(item["hrs_for_month_hrs"])} hrs ${this.formatVal(item["hrs_for_month_min"])} mins</td>
          <td>${this.formatVal(item["rhsi_till_current_month"])} hrs</td>
        </tr>`, 3, "No equipment records found");

    const tab2Rows = this.renderTableRows(tab2, item => `<tr>
          <td>${this.formatVal(item["name"])}</td>
          <td>${this.formatVal(item["serial_no"])}</td>
          <td>${this.formatVal(item["hrs_steamed_in_month"])}</td>
          <td>${this.formatVal(item["hrs_steamed_since_commissioning"])}</td>
          <td>${this.formatVal(item["hrs_above_20_percent"])}</td>
        </tr>`, 5, "No boiler records found");

    const tab3Rows = this.renderTableRows(tab3, item => `<tr>
          <td>${this.formatVal(item["from_date"])}</td>
          <td>${this.formatVal(item["to_date"])}</td>
          <td>${this.formatVal(item["ship_state"])}</td>
          <td>${this.formatVal(item["ship_location"])}</td>
          <td>${this.formatVal(item["ship_activity_type"])}</td>
          <td>${this.formatVal(item["remarks"])}</td>
        </tr>`, 6, "No ship activities found");

    const tab4Rows = this.renderTableRows(tab4Fuel, item => `<tr>
          <td>${this.formatVal(item["b_f_from_last_month"])}</td>
          <td>${this.formatVal(item["recieved"])}</td>
          <td>${this.formatVal(item["consumed_in_harbour"])}</td>
          <td>${this.formatVal(item["consumed_at_sea"])}</td>
          <td>${this.formatVal(item["total_consumed"])}</td>
          <td>${this.formatVal(item["balance_left_on_board"])}</td>
        </tr>`, 6, "No fuel consumption records found");

    const tab5Rows = this.renderTableRows(tab5Iccp, item => `<tr>
          <td>${this.formatVal(item["nomenclature"])}</td>
          <td>${this.formatVal(item["loc_on_board"])}</td>
          <td>${this.formatVal(item["ops_or_non_ops"]) || "Operational"}</td>
        </tr>`, 3, "No ICCP records found");

    const tab6Rows = this.renderTableRows(tab6Kits, item => `<tr>
          <td>${this.formatVal(item["description"])}</td>
          <td>${this.formatVal(item["next_calibration_due_date"])}</td>
        </tr>`, 2, "No test kit records found");

    const tab7Rows = this.renderTableRows(tab7Sdc, item => `<tr>
          <td>${this.formatVal(item["eqpt_name"])}</td>
          <td>${this.formatVal(item["loc_on_board"])}</td>
          <td>${this.formatVal(item["date_of_sdc"])}</td>
          <td>${this.formatVal(item["last_sfc_trial_date"])}</td>
        </tr>`, 4, "No SDC records found");

    const tab12Rows = this.renderTableRows(tab12Lub, item => `<tr>
          <td>${this.formatVal(item["name"])}</td>
          <td>${this.formatVal(item["quantity"])}</td>
          <td>${this.formatVal(item["unit"])}</td>
        </tr>`, 3, "No lubricant records found");

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SRAR Report - ${monthName} ${year}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm 12mm; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 11px; line-height: 1.4; background: #fff; }
    .no-print-toolbar { position: fixed; top: 12px; right: 12px; z-index: 9999; display: flex; gap: 8px; background: rgba(15,23,42,0.9); padding: 8px 12px; border-radius: 8px; backdrop-filter: blur(4px); }
    .btn-action { background: #0284c7; color: #ffffff; border: none; padding: 6px 14px; font-weight: 600; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .btn-action:hover { background: #0369a1; }
    .btn-close { background: #475569; }
    .header-bar { text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 16px; }
    .navy-title { font-size: 18px; font-weight: 800; color: #0f172a; letter-spacing: 1.5px; text-transform: uppercase; margin: 0; }
    .navy-subtitle { font-size: 13px; color: #0284c7; font-weight: 700; margin-top: 4px; text-transform: uppercase; }
    .meta-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; background: #f8fafc; padding: 10px; border-radius: 6px; border: 1px solid #cbd5e1; margin-bottom: 16px; }
    .meta-cell { display: flex; flex-direction: column; }
    .meta-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
    .meta-value { font-size: 11px; font-weight: 700; color: #0f172a; margin-top: 2px; }
    .sec-header { font-size: 12px; font-weight: 700; color: #0f172a; background: #e2e8f0; padding: 5px 8px; border-left: 4px solid #0284c7; margin-top: 14px; margin-bottom: 6px; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
    th { background: #f1f5f9; color: #1e293b; font-weight: 700; text-align: left; padding: 5px 7px; border: 1px solid #cbd5e1; text-transform: uppercase; }
    td { padding: 5px 7px; border: 1px solid #e2e8f0; color: #334155; }
    tr:nth-child(even) td { background: #f8fafc; }
    .sign-section { margin-top: 35px; display: flex; justify-content: space-between; page-break-inside: avoid; }
    .sign-box { text-align: center; width: 220px; border-top: 1px dashed #64748b; padding-top: 6px; font-size: 11px; font-weight: 700; color: #334155; }
    @media print { .no-print-toolbar { display: none !important; } body { padding: 0; } }
  </style>
</head>
<body>
  <div class="no-print-toolbar">
    <button class="btn-action" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn-action btn-close" onclick="window.close()">Close</button>
  </div>

  <div class="header-bar">
    <h1 class="navy-title">INDIAN NAVY — SHIP RETURNS</h1>
    <div class="navy-subtitle">SHIP RUNNING AND ANALYSIS RETURN (SRAR)</div>
  </div>

  <div class="meta-box">
    <div class="meta-cell"><span class="meta-label">SRAR Period</span><span class="meta-value">${monthName} ${year}</span></div>
    <div class="meta-cell"><span class="meta-label">Report ID</span><span class="meta-value">SRAR/${year}/${String(monthNum).padStart(2, '0')}/${String(reportId).padStart(3, '0')}</span></div>
    <div class="meta-cell"><span class="meta-label">Distance Run (Month)</span><span class="meta-value">${this.formatVal(header["distance_run_month"])} NM</span></div>
    <div class="meta-cell"><span class="meta-label">Max Speed Date</span><span class="meta-value">${this.formatVal(header["max_speed_date"])}</span></div>
    <div class="meta-cell"><span class="meta-label">Max Speed</span><span class="meta-value">${this.formatVal(header["max_speed"])} Knots</span></div>
    <div class="meta-cell"><span class="meta-label">Max Shaft RPM</span><span class="meta-value">${this.formatVal(header["max_shaft_rpm"])}</span></div>
    <div class="meta-cell"><span class="meta-label">Engineer Officer</span><span class="meta-value">${this.formatVal(header["eo_name"])} (${this.formatVal(header["eo_rank"])})</span></div>
    <div class="meta-cell"><span class="meta-label">EO Contact</span><span class="meta-value">${this.formatVal(header["eo_contact_no"])}</span></div>
  </div>

  <!-- Tab 1: Equipment Exploitation -->
  <div class="sec-header">1. Equipment Exploitation & Running Hours</div>
  <table>
    <thead>
      <tr>
        <th>Item ID</th>
        <th>Hours for Month</th>
        <th>RHSI Current Month</th>
      </tr>
    </thead>
    <tbody>${tab1Rows}</tbody>
  </table>

  <!-- Tab 2: Boiler Steaming Data -->
  <div class="sec-header">2. Boiler Steaming Details</div>
  <table>
    <thead>
      <tr>
        <th>Boiler Name</th>
        <th>Serial No</th>
        <th>Hrs Steamed in Month</th>
        <th>Hrs Steamed Since Comm.</th>
        <th>Hrs Above 20%</th>
      </tr>
    </thead>
    <tbody>${tab2Rows}</tbody>
  </table>

  <!-- Tab 3: Ship Activities -->
  <div class="sec-header">3. Ship Activities & State</div>
  <table>
    <thead>
      <tr>
        <th>From Date</th>
        <th>To Date</th>
        <th>Ship State</th>
        <th>Location</th>
        <th>Activity Type</th>
        <th>Remarks</th>
      </tr>
    </thead>
    <tbody>${tab3Rows}</tbody>
  </table>

  <!-- Tab 4: Fuel Consumption -->
  <div class="sec-header">4. Fuel & AVCAT Consumption</div>
  <table>
    <thead>
      <tr>
        <th>B/F Last Month</th>
        <th>Received</th>
        <th>Harbour Cons.</th>
        <th>Sea Cons.</th>
        <th>Total Cons.</th>
        <th>Balance Onboard</th>
      </tr>
    </thead>
    <tbody>${tab4Rows}</tbody>
  </table>

  <!-- Tab 5: ICCP & Gas Detection -->
  <div class="sec-header">5. ICCP & Gas Detection System</div>
  <table>
    <thead>
      <tr>
        <th>Nomenclature</th>
        <th>Location Onboard</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>${tab5Rows}</tbody>
  </table>

  <!-- Tab 6: Test Kits -->
  <div class="sec-header">6. Test Kits & Calibration</div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th>Next Calibration Due Date</th>
      </tr>
    </thead>
    <tbody>${tab6Rows}</tbody>
  </table>

  <!-- Tab 7: Safety Device Checks -->
  <div class="sec-header">7. Safety Device Checks (SDC)</div>
  <table>
    <thead>
      <tr>
        <th>Equipment Name</th>
        <th>Location</th>
        <th>Date of SDC</th>
        <th>Last SFC Trial Date</th>
      </tr>
    </thead>
    <tbody>${tab7Rows}</tbody>
  </table>

  <!-- Tab 12: Lubricants -->
  <div class="sec-header">12. Lubricant Consumption</div>
  <table>
    <thead>
      <tr>
        <th>Lubricant Name</th>
        <th>Quantity</th>
        <th>Unit</th>
      </tr>
    </thead>
    <tbody>${tab12Rows}</tbody>
  </table>

  <!-- Tab 14: EO Remarks & EEF -->
  <div class="sec-header">14. EO Remarks & Energy Efficiency Factor (EEF)</div>
  <table style="margin-bottom: 20px;">
    <tr>
      <th style="width: 25%;">Designed EEF</th>
      <td>${this.formatVal(tab14Eef["designed"])}</td>
    </tr>
    <tr>
      <th>Reason for Exceeding</th>
      <td>${this.formatVal(tab14Eef["reason_for_exceeding"])}</td>
    </tr>
    <tr>
      <th>Ship Remarks</th>
      <td>${this.formatVal(tab14Eef["ship_remarks"])}</td>
    </tr>
  </table>

  <div class="sign-section">
    <div class="sign-box">
      <br><br>
      Engineer Officer Sign & Date
    </div>
    <div class="sign-box">
      <br><br>
      Commanding Officer Sign & Date
    </div>
  </div>
</body>
</html>`;
  }

  private convertJsonToPdfBlob(data: Record<string, unknown>, title: string): Blob {
    const sanitize = (str: string | number) =>
      String(str || "").replace(/[\\()]/g, "").substring(0, 100);

    let streamText = `BT /F1 16 Tf 40 550 Td (${sanitize(title)}) Tj ET\n`;
    streamText += `BT /F1 10 Tf 40 532 Td (Naval Ship Returns Management System - SRAR Report  |  Date: ${new Date().toLocaleDateString("en-GB")}) Tj ET\n`;
    streamText += `0.2 0.5 0.8 RG 1.5 w 40 520 m 802 520 l S\n`;

    let y = 495;

    const appendPdfLine = (text: string, isHeader = false) => {
      if (y < 40) return;
      const font = isHeader ? "BT /F1 10 Tf" : "BT /F1 9 Tf";
      const cleanText = sanitize(text);
      streamText += `${font} 40 ${y} Td (${cleanText}) Tj ET\n`;
      y -= isHeader ? 16 : 14;
    };

    const header = data["header"] as Record<string, unknown> | undefined;
    if (header) {
      appendPdfLine(`SRAR Return Period: ${header["srar_month"] || ""} ${header["srar_year"] || ""}  |  Status: ${header["is_saved"] ? "Submitted" : "Draft"}`, true);
      appendPdfLine(`Engineer Officer: ${header["eo_name"] || "N/A"} (${header["eo_rank"] || ""})  |  Personal No: ${header["eo_personal_no"] || "N/A"}`, false);
      appendPdfLine(`Hours Underway: ${header["hours_underway_month_hr"] || 0} hrs ${header["hours_underway_month_min"] || 0} mins  |  Distance Run: ${header["distance_run_month"] || 0} NM`, false);
      y -= 8;
    }

    Object.keys(data).forEach(key => {
      if (key === "header" || y < 60) return;
      const val = data[key];
      if (Array.isArray(val)) {
        appendPdfLine(`Section: ${key.replace(/_/g, " ").toUpperCase()} (${val.length} Records)`, true);
        val.slice(0, 5).forEach((item: Record<string, unknown>, idx: number) => {
          if (y < 40) return;
          const name = item["nomenclature"] || item["name"] || item["eqpt_name"] || item["description"] || `Item #${idx + 1}`;
          const detail = item["total_rh_in_month"] || item["hrs_steamed_in_month"] || item["status"] || item["ship_state"] || "";
          appendPdfLine(`  * ${name}: ${detail}`);
        });
        y -= 6;
      }
    });

    const encoder = new TextEncoder();
    const streamLen = encoder.encode(streamText).length;

    const pdfHeader = `%PDF-1.4\n`;
    const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
    const obj2 = `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`;
    const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`;
    const obj4 = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`;
    const obj5 = `5 0 obj\n<< /Length ${streamLen} >>\nstream\n${streamText}\nendstream\nendobj\n`;

    const pos1 = pdfHeader.length;
    const pos2 = pos1 + obj1.length;
    const pos3 = pos2 + obj2.length;
    const pos4 = pos3 + obj3.length;
    const pos5 = pos4 + obj4.length;
    const xrefPos = pos5 + obj5.length;

    const xref =
      `xref\n0 6\n0000000000 65535 f \n` +
      `${String(pos1).padStart(10, "0")} 0000 n \n` +
      `${String(pos2).padStart(10, "0")} 0000 n \n` +
      `${String(pos3).padStart(10, "0")} 0000 n \n` +
      `${String(pos4).padStart(10, "0")} 0000 n \n` +
      `${String(pos5).padStart(10, "0")} 0000 n \n`;

    const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;

    const pdfContent = pdfHeader + obj1 + obj2 + obj3 + obj4 + obj5 + xref + trailer;
    return new Blob([pdfContent], { type: "application/pdf" });
  }

  private triggerBlobDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  satUnsatOptions: DropdownOption[] = [
    { label: "SAT", value: "SAT" },
    { label: "UNSAT", value: "UNSAT" }
  ];

  parseTimeToMinutes(val: string | number | undefined | null): number {
    if (!val) return 0;
    if (typeof val === "number") return val * 60;
    const str = String(val).trim();
    if (!str.includes(":")) {
      const num = Number.parseFloat(str);
      return Number.isNaN(num) ? 0 : Math.round(num * 60);
    }
    const [h, m] = str.split(":").map(x => Number.parseInt(x, 10) || 0);
    return (h * 60) + m;
  }

  formatMinutesToHHMM(minutes: number): string {
    if (Number.isNaN(minutes) || minutes < 0) return "0:00";
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    return `${h}:${String(m).padStart(2, "0")}`;
  }

  /**
   * The "since installation" baseline a saved row was built from: its stored
   * total minus the month it already includes.
   *
   * Every "R/H since installation" column on screen is prev-baseline + this
   * month's hours, recomputed on each keystroke. Reopening a saved report used to
   * restore only the total, leaving the baseline empty — so the first edit
   * recomputed the total as 0 + month and wiped the reading. Restoring the
   * baseline this way keeps the arithmetic reversible: re-saving an untouched row
   * reproduces exactly the total that was stored.
   */
  baselineHHMM(total: string | undefined, includedMonth: string | undefined): string {
    const mins = this.parseTimeToMinutes(total)
      - this.parseTimeToMinutes(includedMonth);
    return this.formatMinutesToHHMM(Math.max(0, mins));
  }

  /** baselineHHMM for a column stored as a plain number (a count, or hours held as a
   *  decimal rather than HH:MM): stored total minus the month it already includes.
   *
   *  Takes `unknown` because its callers read straight off a loaded report's
   *  `Record<string, unknown>` rows; both values are coerced here anyway. */
  baselineNumeric(total: unknown, includedMonth: unknown): string {
    const stored = Number(String(total ?? "").trim() || 0) || 0;
    const month = Number(String(includedMonth ?? "").trim() || 0) || 0;
    return String(Math.max(0, stored - month));
  }

  addHHMMTime(t1: string | undefined, t2: string | undefined): string {
    const m1 = this.parseTimeToMinutes(t1 || "0:00");
    const m2 = this.parseTimeToMinutes(t2 || "0:00");
    return this.formatMinutesToHHMM(m1 + m2);
  }

  validateDieselLoadRegimeSum(item: InjectorFipItem): boolean {
    const fipMins = this.parseTimeToMinutes(item.fipInMonth || "0:00");
    const b30 = this.parseTimeToMinutes(item.hrsBelow30 || "0");
    const b3050 = this.parseTimeToMinutes(item.hrs30to50 || "0");
    const b5070 = this.parseTimeToMinutes(item.hrs50to70 || "0");
    const b70100 = this.parseTimeToMinutes(item.hrs70to100 || "0");
    const sum = b30 + b3050 + b5070 + b70100;
    item.isRegimeMismatch = fipMins !== sum;
    return !item.isRegimeMismatch;
  }

  onDgufAnchorageOrDriftingChange(): void {
    this.recalculateDgufSeaHarbourSplit();
  }

  /** Since-installation total for a column stored as a plain number: last return's
   *  figure plus this month's entry. Columns displayed as HH:MM use addHHMMTime instead.
   *  Kept as a string so it drops straight into the same text inputs (and the same
   *  `Number(... || 0)` save mapping) as everything else. */
  /** An HH:MM figure as the decimal hours its column is stored in.
   *
   *  The Gas Turbine tab shows running hours as HH:MM but GasTurbineExploitation holds
   *  them in Float/Decimal columns, and the save mapping passed them straight to
   *  Number(). `Number("100:00")` is NaN, which serialises to null — so every hours
   *  figure on that tab was written as NULL the moment it contained a colon, which is
   *  always for the computed SI columns. That is what left next month's carry-forward
   *  with nothing to add to. Plain numbers ("100", "100.5") pass through unchanged, so
   *  rows already stored as decimals keep round-tripping exactly as before.
   */
  hhmmToDecimalHours(value: FormItemValue | undefined): number {
    return Math.round((this.parseTimeToMinutes(String(value ?? "")) / 60) * 100) / 100;
  }

  addNumericSi(previous: FormItemValue | undefined, inMonth: FormItemValue | undefined): string {
    const prev = Number(String(previous ?? "").trim() || 0) || 0;
    const month = Number(String(inMonth ?? "").trim() || 0) || 0;
    return String(prev + month);
  }

  onGtRhInMonthChange(gt: GasTurbineExploitationItem): void {
    gt.totalRhSi = this.addHHMMTime(gt.prevTotalRhSi || "0:00", gt.totalRhInMonth || "0:00");
    gt.rhRegime1Si = this.addHHMMTime(gt.prevRhRegime1Si || "0:00", gt.rhRegime1InMonth || "0:00");
    gt.rhRegime2Si = this.addHHMMTime(gt.prevRhRegime2Si || "0:00", gt.rhRegime2InMonth || "0:00");
    gt.rhRegime3Si = this.addHHMMTime(gt.prevRhRegime3Si || "0:00", gt.rhRegime3InMonth || "0:00");
    this.onGtCountInMonthChange(gt);
    this.validateGtLoadRegimeSum(gt);
  }

  // Every "SI" count on the Gas Turbine table, on the same rule as its running hours:
  // last return's since-installation figure plus what this month adds. The In Mth/SI
  // pairs sit in legacy-named fields (see GasTurbineExploitationItem) — the mapping
  // here is the one the tab_10_gas_turbine save payload uses.
  onGtCountInMonthChange(gt: GasTurbineExploitationItem): void {
    gt.noOfRepOrders = this.addNumericSi(gt.prevColdStartsSi, gt.noOfOccasion);
    gt.fuelExploitation = this.addNumericSi(gt.prevHotStartsSi, gt.unscheduledEngagement);
    gt.status = this.addNumericSi(gt.prevFalseStartsSi, gt.gslChemQty);
    gt.rhEngine2 = this.addNumericSi(gt.prevTechStartsSi, gt.rhEngine1);
    gt.lastEhmTrialDate = this.addNumericSi(gt.prevAsternEngagementsSi, gt.lastCalibrationDate);
    gt.noOfStopOrdersSi = this.addNumericSi(gt.prevStopOrdersSi, gt.lastFptDate);
  }

  validateGtLoadRegimeSum(gt: GasTurbineExploitationItem): boolean {
    const totalMins = this.parseTimeToMinutes(gt.totalRhInMonth || "0:00");
    const r1 = this.parseTimeToMinutes(gt.rhRegime1InMonth || "0:00");
    const r2 = this.parseTimeToMinutes(gt.rhRegime2InMonth || "0:00");
    const r3 = this.parseTimeToMinutes(gt.rhRegime3InMonth || "0:00");
    const sum = r1 + r2 + r3;
    gt.isRegimeMismatch = totalMins !== sum;
    return !gt.isRegimeMismatch;
  }

  // Sets each Gas Turbine row's carry-forward SI baselines from the previous month's
  // SRAR (matched by eqpt_code/eqpt_name) and recomputes this month's displayed SI values.
  applyGasTurbineCarryForward(): void {
    for (const gt of this.gasTurbineExploitation) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.gas_turbine, gt.eqptCode, gt.eqptName, gt.shipEquipmentId
      );
      gt.prevTotalRhSi = String(prev?.total_rh_si ?? "0:00");
      gt.prevRhRegime1Si = String(prev?.rh_regime_1_si ?? "0:00");
      gt.prevRhRegime2Si = String(prev?.rh_regime_2_si ?? "0:00");
      gt.prevRhRegime3Si = String(prev?.rh_regime_3_si ?? "0:00");
      gt.prevColdStartsSi = String(prev?.no_of_cold_starts_si ?? 0);
      gt.prevHotStartsSi = String(prev?.no_of_hot_starts_si ?? 0);
      gt.prevFalseStartsSi = String(prev?.no_of_false_starts_si ?? 0);
      gt.prevTechStartsSi = String(prev?.no_of_tech_starts_si ?? 0);
      gt.prevAsternEngagementsSi = String(prev?.no_of_astern_engagements_count ?? 0);
      gt.prevStopOrdersSi = String(prev?.no_of_stop_orders_si ?? 0);
      this.onGtRhInMonthChange(gt);
    }
  }

  onRgRhInMonthChange(rg: GtReductionGearItem): void {
    rg.totalRhsi = this.addHHMMTime(rg.prevTotalRhsi || "0:00", rg.totalRhInMonth || "0:00");
    rg.hoRegimeBelow0_25Si = this.addHHMMTime(rg.prevHoRegimeBelow0_25Si || "0:00", rg.hoRegimeBelow0_25 || "0:00");
    rg.hoRegime0_25to0_5Si = this.addHHMMTime(rg.prevHoRegime0_25to0_5Si || "0:00", rg.hoRegime0_25to0_5 || "0:00");
    rg.hoRegime0_5to0_75Si = this.addHHMMTime(rg.prevHoRegime0_5to0_75Si || "0:00", rg.hoRegime0_5to0_75 || "0:00");
    this.onRgTrailingOrEngagementChange(rg);
    this.validateRgLoadRegimeSum(rg);
  }

  // The rest of the Reduction Gear table's SI columns — trailing hours, service life and
  // the four engagement-regime counts — on the same carry-forward rule. Trailing hours and
  // service life are HH:MM like the running hours above; the regime figures are counts.
  onRgTrailingOrEngagementChange(rg: GtReductionGearItem): void {
    rg.slidingHours0_25Si = this.addHHMMTime(rg.prevSlidingHours0_25Si || "0:00", rg.slidingHours0_25 || "0:00");
    rg.serviceLifeSi = this.addHHMMTime(rg.prevServiceLifeSi || "0:00", rg.serviceLife || "0:00");
    rg.routineRegime1Si = this.addNumericSi(rg.prevRoutineRegime1Si, rg.routineRegime1);
    rg.routineRegime2Si = this.addNumericSi(rg.prevRoutineRegime2Si, rg.routineRegime2);
    rg.routineRegime3Si = this.addNumericSi(rg.prevRoutineRegime3Si, rg.routineRegime3);
    rg.routineRegime4Si = this.addNumericSi(rg.prevRoutineRegime4Si, rg.routineRegime4);
  }

  validateRgLoadRegimeSum(rg: GtReductionGearItem): boolean {
    const totalMins = this.parseTimeToMinutes(rg.totalRhInMonth || "0:00");
    const r1 = this.parseTimeToMinutes(rg.hoRegimeBelow0_25 || "0:00");
    const r2 = this.parseTimeToMinutes(rg.hoRegime0_25to0_5 || "0:00");
    const r3 = this.parseTimeToMinutes(rg.hoRegime0_5to0_75 || "0:00");
    rg.isRegimeMismatch = totalMins !== (r1 + r2 + r3);
    return !rg.isRegimeMismatch;
  }

  onDieselRgHrsForMonthChange(rg: DieselReductionGearItem): void {
    rg.hrsSinceInstallation = this.addHHMMTime(
      rg.prevHrsSinceInstallation || "0:00", rg.hrsForMonth || "0:00"
    );
  }

  // Same carry-forward rule as the Tab 10 Reduction Gear table, with a single
  // running total: last month's hours-since-installation plus this month's hours.
  applyDieselReductionGearCarryForward(): void {
    for (const rg of this.dieselReductionGear) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.diesel_reduction_gear, rg.eqptCode, rg.eqptName, rg.shipEquipmentId
      );
      rg.prevHrsSinceInstallation = String(prev?.hrs_since_installation ?? "0:00");
      this.onDieselRgHrsForMonthChange(rg);
    }
  }

  // Sets each Reduction Gear row's carry-forward SI baselines from the previous month's
  // SRAR (matched by eqpt_code/eqpt_name) and recomputes this month's displayed SI values.
  applyReductionGearCarryForward(): void {
    for (const rg of this.gtReductionGear) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.reduction_gear, rg.eqptCode, rg.eqptName, rg.shipEquipmentId
      );
      rg.prevTotalRhsi = String(prev?.total_rh_si ?? "0:00");
      rg.prevHoRegimeBelow0_25Si = String(prev?.total_rh_regime1_si ?? "0:00");
      rg.prevHoRegime0_25to0_5Si = String(prev?.total_rh_regime2_si ?? "0:00");
      rg.prevHoRegime0_5to0_75Si = String(prev?.total_rh_regime3_si ?? "0:00");
      rg.prevSlidingHours0_25Si = String(prev?.trailing_rh_si ?? "0:00");
      rg.prevServiceLifeSi = String(prev?.service_life_si ?? "0:00");
      rg.prevRoutineRegime1Si = String(prev?.no_of_eng_regime1_si ?? 0);
      rg.prevRoutineRegime2Si = String(prev?.no_of_eng_regime2_si ?? 0);
      rg.prevRoutineRegime3Si = String(prev?.no_of_eng_regime3_si ?? 0);
      rg.prevRoutineRegime4Si = String(prev?.no_of_eng_regime4_si ?? 0);
      this.onRgRhInMonthChange(rg);
    }
  }

  // Tab 11 GTG: same carry-forward rule as the GT tables above. This tab previously had
  // no baseline at all — calculateGtgRh added Tab 1's hours-underway to this month's
  // total instead of last return's SI, and the four start counters were free-text.
  applyGtgCarryForward(): void {
    for (const gtg of this.gtgExploitationData) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.gtg, gtg.eqptCode, gtg.eqptName, gtg.shipEquipmentId
      );
      gtg.prevTotalRhsi = String(prev?.total_rh_si ?? "0:00");
      gtg.prevColdStartsSi = String(prev?.no_of_cold_starts_si ?? 0);
      gtg.prevHotStartsSi = String(prev?.no_of_hot_starts_si ?? 0);
      gtg.prevBatteryColdStartsSi = String(prev?.no_of_battery_cold_starts_si ?? 0);
      gtg.prevBatteryHotStartsSi = String(prev?.no_of_battery_hot_starts_si ?? 0);
      this.calculateGtgRh(gtg);
    }
  }

  applyGtgReductionGearCarryForward(): void {
    for (const rg of this.gtgReductionGear) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.gtg_reduction_gear, rg.eqptCode, rg.eqptName, rg.shipEquipmentId
      );
      rg.prevInMonthsSi = String(prev?.in_months_si ?? 0);
      this.onGtgRgRunningHoursChange(rg);
    }
  }

  // RG running hours here are stored as a plain float (unlike the GT tables' HH:MM
  // columns), so this adds numerically — an HH:MM string would reach the save mapping's
  // Number() as NaN and be written as null.
  // Tab 9 Full Power Trials (Main Engine). A full power trial isn't run every month, so
  // last return's particulars are still the current ones — carried forward to be confirmed
  // rather than retyped. Only fills blanks: anything already entered for this month wins.
  applyFptMainEngineCarryForward(): void {
    const prev = this.carryForward.fpt_main_engine;
    if (!prev) return;

    const fill = (key: keyof typeof this.fptMainEngineGeneral, value: unknown) => {
      if (value === null || value === undefined || value === "") return;
      if (String(this.fptMainEngineGeneral[key] ?? "").trim()) return;
      this.fptMainEngineGeneral[key] = String(value);
    };

    fill("lastFptDate", prev.date);
    fill("displacement", prev.displacement);
    fill("maxSpeed", prev.max_speed);
    fill("occasionReason", prev.occasion_reason);
    fill("draughtFwd", prev.draught_fwd);
    fill("draughtAft", prev.draught_aft);
    fill("conductedBy", prev.conducted_by);
    fill("torsionMotorReading", prev.torsion_meter_reading);
    fill("seaState", prev.sea_state);
    fill("remarks", prev.pending_dr_activities_reason);
  }

  // Tab 13 R/H Extension. An extension granted last month is still the standing one, so
  // its trial figures and authority reference carry forward onto this month's roster.
  applyRhExtensionCarryForward(): void {
    const rows = this.carryForward.rh_extensions || [];
    if (!rows.length) return;

    const apply = (targets: RhExtensionItem[], equipmentType: number) => {
      for (const target of targets) {
        const prev = rows.find(row =>
          row.equipment_type === equipmentType &&
          this.carryForwardRowMatches(row, target.eqptName, target.serNo, target.shipEquipmentId)
        );
        if (!prev) continue;
        if (!String(target.onRoutine || "").trim()) {
          target.onRoutine = String(prev.on_routine_text ?? "");
          target.onRoutineId = prev.on_routine ?? null;
        }
        if (!String(target.rhDuringTrial || "").trim()) {
          target.rhDuringTrial = String(prev.rh_ext_at_conduct_of_ext_trial ?? "");
        }
        if (!String(target.trialConductedBy || "").trim()) {
          target.trialConductedBy = String(prev.trial_conducted_by ?? "");
        }
        if (!String(target.authorityLetterRef || "").trim()) {
          target.authorityLetterRef = String(prev.authority_letter_for_extension_trial ?? "");
        }
        if (!String(target.rhExtensionGranted || "").trim()) {
          target.rhExtensionGranted = String(prev.rh_extension_granted_upto ?? "");
        }
        if (!String(target.rhLeftExpiry || "").trim()) {
          target.rhLeftExpiry = String(prev.rh_left_for_expiry_of_extension ?? "");
        }
      }
    };

    apply(this.mainEngineRHExtensions, 1);
    apply(this.dieselAlternatorRHExtensions, 2);
  }

  /** Per-equipment "On Routine" options, keyed by ShipEquipment id. The Step 13 dropdown
   *  offered the entire Frequency master on every row, so an operator could pick an
   *  extension routine the equipment does not have. Loaded once per equipment on the
   *  rows this tab actually shows. */
  equipmentRoutineOptions: Record<number, SrarRoutineHourOption[]> = {};

  /** The routines to offer for one R/H Extension row: its own if we have them, else the
   *  master list — On Routine is mandatory on the Diesel Alternator table, so an empty
   *  dropdown would make the return unsubmittable. */
  routineOptionsFor(rh: RhExtensionItem): SrarRoutineHourOption[] {
    const id = rh.shipEquipmentId;
    if (typeof id === "number" && this.equipmentRoutineOptions[id]?.length) {
      return this.equipmentRoutineOptions[id];
    }
    return this.routineHourOptions;
  }

  loadEquipmentRoutineOptions(): void {
    const ids = new Set<number>();
    for (const rh of [...this.mainEngineRHExtensions, ...this.dieselAlternatorRHExtensions]) {
      if (typeof rh.shipEquipmentId === "number") ids.add(rh.shipEquipmentId);
    }

    for (const id of ids) {
      if (this.equipmentRoutineOptions[id]) continue;
      this.srarService.getEquipmentRoutines(id).subscribe({
        next: (data) => {
          // A fallback response is the whole master, which routineOptionsFor() already
          // falls back to — storing it would just pin the master onto this equipment.
          if (!data.fallback && data.options?.length) {
            this.equipmentRoutineOptions[id] = data.options;
          }
        }
      });
    }
  }

  /** Same matching rule findCarryForwardByEquipment uses — id first, then name/serial. */
  private carryForwardRowMatches(
    row: { sfd_details: number | null; eqpt_name: string | null; serial_no: string | null },
    eqptName: string | undefined,
    serialNo: string | undefined,
    shipEquipmentId: number | undefined
  ): boolean {
    if (typeof shipEquipmentId === "number" && row.sfd_details === shipEquipmentId) return true;
    const name = String(eqptName ?? "").trim().toLowerCase();
    if (name && String(row.eqpt_name ?? "").trim().toLowerCase() === name) return true;
    const serial = String(serialNo ?? "").trim().toLowerCase();
    return Boolean(serial) && String(row.serial_no ?? "").trim().toLowerCase() === serial;
  }

  onGtgRgRunningHoursChange(rg: GtgReductionGearItem): void {
    rg.inMonthsSi = this.addNumericSi(rg.prevInMonthsSi, rg.rgRunningHours);
  }


  loadMetadata() {
    this.srarService.getShipStates().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.shipStates = data.map((x: LookupItem) => x.name);
        }
      }
    });
    this.srarService.getShipLocations().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.shipLocations = data.map((x: LookupItem) => x.name);
        }
      }
    });
    this.srarService.getActivityTypes().subscribe({
      next: (data: LookupItem[]) => {
        if (data && data.length > 0) {
          this.activityTypes = data.map((x: LookupItem) => x.name);
        }
      }
    });
    this.srarService.getRoutineHours().subscribe({
      next: (data) => {
        this.routineHourOptions = Array.isArray(data) ? data : [];
      },
      error: () => {
        // A missing routine list must not blank out a saved selection: the label is
        // held on the row itself (onRoutine), so the select falls back to showing it
        // via the current-value option in the template.
        this.routineHourOptions = [];
      }
    });
    this.srarService.getActivityDetails().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.activityDetails = data.map((x: LookupItem) => x.name);
        }
      }
    });
    this.srarService.getLubricantUnits().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.lubricantUnits = data.map((x: LookupItem) => x.name);
        }
      }
    });
    this.srarService.getEefReasons().subscribe({
      next: (data) => {
        if (data && data.length > 0) {
          this.eefReasons = data.map((x: LookupItem) => x.name);
        }
      }
    });
  }


  resetFormForNewReport(): void {
    this.srarId = null;
    this.currentReportSentToCo.set(false);
    this.currentReportCoApproved.set(false);
    this.currentReportCmmsSynced.set(false);
    this.coApprovalChecked.set(false);
    this.runningParameters = {
      baselineSinceCommHours: 0,
      baselineSinceCommMinutes: 0,
      baselineSinceCommDistance: 0,
      duringMonthHours: 0,
      duringMonthMinutes: 0,
      duringMonthDistance: "0.00",
      sinceCommHours: "0:00",
      sinceCommDistance: "0.00",
      maxSpeedDuringMonth: "",
      maxSpeedDurationHours: 0,
      maxSpeedDurationMinutes: 0,
      maxSpeedDate: "",
      maxShaftRpm: ""
    };
    this.dgufRunningHoursData = {
      totalRhSea: "00:00",
      hrsUnderway: "00:00",
      anchorage: "00:00",
      drifting: "00:00",
      hrsInHarbour: "00:00",
      hrsShoreSupply: "00:00",
      coldMoves: 0,
      comments: ""
    };
    this.recalculateDgufSeaHarbourSplit();
    this.eoDetails = {
      name: "",
      rank: "",
      personalNo: "",
      contactNo: "",
      writerContactNo: "",
      sendToCo: false
    };
    this.activities = [];
    this.fuelConsumption = {
      bfLastMonth: "0",
      received: "0",
      consHarbor: "0",
      consAnchorage: "0",
      consSea: "0",
      totalCons: "0",
      defueled: "0",
      balLeftOnboard: "0"
    };
    this.avcatStatus = {
      bfLastMonth: "0",
      received: "0",
      givenToAc: "0",
      usedForTrials: "0",
      totalCons: "0",
      defueled: "0",
      balLeftOnboard: "0"
    };
    this.eefData = {
      hoursUnderway: "0:00",
      designed: null,
      reasonExceeding: "",
      shipRemarks: ""
    };

    this.equipments.set([]);
    this.boilerSteamingData = [];
    this.alkalinityData = [];
    this.torsionMeterData = [];
    this.iccpData = [];
    this.h2sSensorData = [];
    this.stpData = [];
    this.mffsData = [];
    this.lubOilFuelCentrifuge = [];
    // Not emptied like the tables above it: every other list here is rebuilt by the
    // loadMasterEquipmentsFromBackend() call at the end of this method, but the test
    // kits have no equipment-master source to rebuild them from — clearing them left
    // Step 6's first table permanently empty for the rest of the session, with no way
    // for the ship to declare its kits at all.
    this.lubOilCoolantTestKits = SrarTransactionComponent.defaultTestKits();
    this.safetyDeviceChecks = [];
    this.injectorFipCalibration = [];
    this.dgufGeneratorData = [];
    this.gasTurbineExploitation = [];
    this.dieselReductionGear = [];
    this.gtReductionGear = [];
    this.gtReplacementMajorAssemblies = [];
    this.gtRoutinesUndertaken = [];
    this.gtgExploitationData = [];
    this.gtgReductionGear = [];
    this.gtgReplacementMajorAssemblies = [];
    this.gtgRoutinesUndertaken = [];
    this.fptMainEngineSpecific = [];
    this.fptDieselGeneratorLoad = [];
    this.mainEngineRHExtensions = [];
    this.dieselAlternatorRHExtensions = [];
    this.lubricantData = [];

    this.loadMasterEquipmentsFromBackend();
    this.loadRunningHoursEquipment();
    this.loadCarryForwardData();
  }

  // Real ShipEquipment instances for Tab 1 (Equipment — Monthly Running Hours),
  // replacing the previously hardcoded per-ship equipment sample rows. prevHours
  // starts at 0 until applyEquipmentHoursCarryForward() fills it in from last month's
  // saved SRAR (whichever of that call and loadCarryForwardData() resolves second
  // finishes the merge — same pattern as loadMasterEquipmentsFromBackend() below).
  loadRunningHoursEquipment(): void {
    this.srarService.getRunningHoursEquipment().subscribe({
      next: (rows) => {
        this.equipments.set(this.reconcileEquipmentRows(
          rows ?? [],
          (row) => row.id,
          this.equipments(),
          (row): EquipmentItem => {
            // Tab 1's own saved rows carry no nomenclature/code of their own (see
            // savedEquipmentHoursByShipEquipmentId) — the display fields always come
            // fresh from this ShipEquipment row; only the previously-entered hours are
            // pulled back in, keyed by the same id.
            const saved = typeof row.id === "number"
              ? this.savedEquipmentHoursByShipEquipmentId.get(row.id)
              : undefined;
            const savedHrs = saved && typeof saved["hrs_for_month_hrs"] === "number" ? saved["hrs_for_month_hrs"] as number : null;
            const savedMins = saved && typeof saved["hrs_for_month_min"] === "number" ? saved["hrs_for_month_min"] as number : null;
            const prevHours = this.savedRhsiHours(saved) ?? 0;
            const monthlyHours = savedHrs != null ? `${savedHrs}:${String(savedMins ?? 0).padStart(2, "0")}` : "0:00";
            return {
              id: row.id,
              srarExploitationId: saved && typeof saved["id"] === "number" ? saved["id"] as number : null,
              shipEquipmentId: row.id,
              name: row.equipment_name,
              nomenclature: row.nomenclature,
              eqptCode: row.equipment_code || "",
              serNo: row.serial_no || "",
              prevHours,
              monthlyHours,
              cumulativeHours: this.computeCumulativeHHMM(prevHours, monthlyHours)
            };
          },
          // A row can already be on screen from the roster load that runs on page
          // open, before any report is chosen — at that point there are no saved
          // hours to apply. Once loadReportDetails() has stashed this report's own
          // rows, they have to be folded onto those existing rows or the report
          // reopens showing 0:00 for everything it saved. Only rows this report
          // actually saved are touched; anything else keeps what is on screen,
          // including unsaved edits.
          (existing, row): EquipmentItem => {
            const saved = typeof row.id === "number"
              ? this.savedEquipmentHoursByShipEquipmentId.get(row.id)
              : undefined;
            if (!saved) return existing;
            const savedHrs = typeof saved["hrs_for_month_hrs"] === "number" ? saved["hrs_for_month_hrs"] as number : null;
            const savedMins = typeof saved["hrs_for_month_min"] === "number" ? saved["hrs_for_month_min"] as number : null;
            const prevHours = this.savedRhsiHours(saved) ?? existing.prevHours ?? 0;
            const monthlyHours = savedHrs != null
              ? `${savedHrs}:${String(savedMins ?? 0).padStart(2, "0")}`
              : (existing.monthlyHours || "0:00");
            return {
              ...existing,
              // Carrying the saved row's own id back is what makes the next save an
              // update of that row instead of a delete-and-recreate.
              srarExploitationId: typeof saved["id"] === "number" ? saved["id"] as number : existing.srarExploitationId,
              prevHours,
              monthlyHours,
              cumulativeHours: this.computeCumulativeHHMM(prevHours, monthlyHours)
            };
          }
        ));
        // Runs for an existing report too, not just a new one: its own saved rows still
        // win (see applyEquipmentHoursCarryForward), but equipment it has no saved row
        // for — anything added to SRAR Masters after the report was first created —
        // otherwise sat at 0:00 forever instead of picking up its real running hours.
        this.applyEquipmentHoursCarryForward();
      },
      error: (err: unknown) => console.error("Failed to load running hours equipment:", err)
    });
  }

  // This report's own saved "Hrs Since Installation" for one equipment, or null when it
  // has none worth keeping. A stored 0 counts as "no reading", not as a real running
  // total: nothing fitted to a hull genuinely has zero hours since installation, and
  // rows filed while this column was broken hold a literal 0 — treating those as data
  // let one bad save permanently shadow the real reading carry-forward would supply.
  // Mirrors the same rule on the backend (_equipment_rhsi_carry_forward, srar/views.py).
  private savedRhsiHours(saved: Record<string, unknown> | undefined): number | null {
    const value = saved?.["rhsi_till_current_month"];
    return typeof value === "number" && value > 0 ? value : null;
  }

  // Fills each Tab 1 row's "Hrs Since Installation" from the carry-forward payload,
  // matched by ShipEquipment id (sfd_details). The backend resolves that from the most
  // recent earlier return, falling back to the RHSI reading CMMS itself holds for the
  // equipment — see _equipment_rhsi_carry_forward (srar/views.py).
  //
  // A value this report already saved for that equipment always wins, so reopening a
  // report shows what was actually filed rather than silently re-deriving it.
  applyEquipmentHoursCarryForward(): void {
    const prevByEquipment = new Map(
      this.carryForward.equipment_hours
        .filter(row => row.sfd_details != null)
        .map(row => [row.sfd_details, row.rhsi_till_current_month])
    );
    if (!prevByEquipment.size) return;
    this.equipments.update(rows => rows.map(row => {
      const saved = typeof row.shipEquipmentId === "number"
        ? this.savedEquipmentHoursByShipEquipmentId.get(row.shipEquipmentId)
        : undefined;
      if (this.savedRhsiHours(saved) !== null) return row;
      const prev = typeof row.shipEquipmentId === "number" ? prevByEquipment.get(row.shipEquipmentId) : undefined;
      if (prev == null) return row;
      return {
        ...row,
        prevHours: prev,
        cumulativeHours: this.computeCumulativeHHMM(prev, String(row.monthlyHours || "0:00"))
      };
    }));
  }

  // Equipment-driven SRAR tabs must reflect SRAR Masters additions/removals immediately:
  // rebuild each tab's row list from whatever equipment is currently linked under its
  // category, keeping already-entered values for equipment that's still linked (matched
  // by the underlying ShipEquipment id, not array position) and dropping rows for
  // equipment that's been unlinked from Masters since this was last loaded.
  /**
   * Merges a freshly fetched equipment roster onto the rows already on screen.
   *
   * An existing row is kept as-is by default so a roster refresh never discards
   * what the user has typed. `refreshExisting` is the escape hatch for the case
   * where that default is wrong: authoritative saved data has arrived *after* the
   * roster was first built, and the kept row is the stale one. Without it, opening
   * a saved report on a page whose roster had already loaded showed every row back
   * at 0:00 — the report's own saved hours were fetched, then thrown away here.
   */
  private reconcileEquipmentRows<TSource, TRow extends { shipEquipmentId?: number }>(
    sourceRows: TSource[],
    idOf: (source: TSource) => number | string | null | undefined,
    existingRows: TRow[],
    buildDefault: (source: TSource, index: number) => TRow,
    refreshExisting?: (existing: TRow, source: TSource, index: number) => TRow
  ): TRow[] {
    const existingByEquipmentId = new Map<number, TRow>();
    existingRows.forEach(row => {
      if (typeof row.shipEquipmentId === "number") {
        existingByEquipmentId.set(row.shipEquipmentId, row);
      }
    });
    return sourceRows.map((source, index) => {
      const rawId = idOf(source);
      const numericId = rawId == null ? undefined : Number(rawId);
      const eqId = typeof numericId === "number" && Number.isFinite(numericId) ? numericId : undefined;
      const existing = eqId != null ? existingByEquipmentId.get(eqId) : undefined;
      if (existing) {
        return refreshExisting ? refreshExisting(existing, source, index) : existing;
      }
      const built = buildDefault(source, index);
      built.shipEquipmentId = eqId;
      return built;
    });
  }

  // Load master equipment list dynamically from backend for Tabs 2+ (boilers, torsion
  // meter, ICCP, H2S, STP...), merging safely without overwriting prevHours
  loadMasterEquipmentsFromBackend() {
    this.srarService.getEquipments().subscribe({
      next: (eqList: SrarEquipmentLookupRow[]) => {
        const list = Array.isArray(eqList) ? eqList : [];

        // Each row's `universal_id_ch_master_equipment_type` is the CMMS
        // Ch_Master_Equipment_Type category code, set once — reliably — when the
        // equipment was linked under that category via "Add SRAR Equipment" in
        // Masters. Filtering on this code (instead of guessing from free-text
        // nomenclature keywords, which real CMMS equipment names routinely don't
        // contain, e.g. "MAIN DIESEL ENGINE STBD" has no "main engine" substring) is
        // what makes each tab show exactly — and only — the equipment linked under
        // its own category. Category ids: 1 Main Engine, 2 Diesel Alternator,
        // 4 Reduction Gear (diesel, Tab 7), 35 Reduction Gear (gas turbine, Tab 10),
        // 10 STP, 19 Gas Turbine,
        // 20 H2S Sensors, 24 Centrifuge, 26 Torsion Meter, 29 ICCP, 30 MFFS,
        // 34 Gas Turbine Generator, 36 Reduction Gear (GTG).
        const byCategory = (codes: string[]) => list.filter(item =>
          codes.includes(String(item.universal_id_ch_master_equipment_type ?? ""))
        );
        const equipmentIdOf = (item: SrarEquipmentLookupRow) => item.equipment_id;

        // Tab 2: Boilers. Both Step 2 tables are read-only rosters with no Add button,
        // so until this was wired they could never hold a row and the step was blank.
        //
        // BOILER_CATEGORY_CODE is not a CMMS Ch_Master_Equipment_Type id: SWMM's
        // category catalog has a "Boiler" row whose code is null, and every numeric code
        // on this hull already belongs to another category, so there is nothing to filter
        // on yet. The non-numeric placeholder cannot collide with a real CMMS id —
        // replace it (here and in the seed_srar_demo_equipment command) with the real id
        // once CMMS provides it, and boiler equipment synced from CMMS will flow in with
        // no other change.
        const boilers = byCategory([BOILER_CATEGORY_CODE]);
        this.boilerSteamingData = this.reconcileEquipmentRows(
          boilers, equipmentIdOf, this.boilerSteamingData,
          (b, idx): BoilerSteamingItem => {
            const nome = b.srar_txt || b.nomenclature || b.equipment_desc || `Boiler No. ${idx + 1}`;
            return {
              eqptName: nome,
              nomenclature: nome,
              locOnBoard: b.location_on_board || "Boiler Room",
              serNo: b.serial_no || `BLR-0${idx + 1}`,
              hrsSteamedDuringMonth: "",
              hrsSteamedSinceComm: "",
              hrsAbove80: "",
              lastEstOlgDate: "",
              hrsSteamedSinceLastOlg: "",
              hrsSteamedAtLastOlg: "",
              lastEstOlgDate2: "",
              hrsSteamedSinceLastOlg2: "",
              hrsSteamedAtLastOlg2: "",
              lastRetubingDate: "",
              hrsSteamedSinceLastRetubing: "",
              hrsSteamedAtLastRetubing: "",
              lastHydraulicTestDate: "",
              nextInspectionDate: "",
              lifeAssessedMonths: ""
            };
          }
        );
        // Second Step 2 table — same boiler roster, its own set of monthly readings.
        this.alkalinityData = this.reconcileEquipmentRows(
          boilers, equipmentIdOf, this.alkalinityData,
          (b, idx): BoilerAlkalinityItem => {
            const nome = b.srar_txt || b.nomenclature || b.equipment_desc || `Boiler No. ${idx + 1}`;
            return {
              eqptName: nome,
              nomenclature: nome,
              locOnBoard: b.location_on_board || "Boiler Room",
              serNo: b.serial_no || `BLR-0${idx + 1}`,
              salinityLastWeek: "",
              chlorideDuringMonth: "",
              excessSalinity: "",
              alkalinityN: "",
              phYarr: "",
              tdsMax750: "",
              phosphate1060: "",
              phosphate0: "",
              alkalinityMax: "",
              alkPpm: "",
              alkalinityPercent: "",
              phJvn: "",
              tdsMax750Jvn: "",
              phosphate1060Jvn: ""
            } as BoilerAlkalinityItem;
          }
        );

        // Tab 4: Torsion Meter.
        this.torsionMeterData = this.reconcileEquipmentRows(
          byCategory(["26"]), equipmentIdOf, this.torsionMeterData,
          (t, idx): TorsionMeterItem => ({
            srNo: idx + 1,
            nomenclature: t.srar_txt || t.nomenclature || t.equipment_desc || "Torsion Meter",
            eqptCode: `TM-0${idx + 1}`,
            locOnBoard: "Shaft Tunnel",
            opsNonOps: "Ops",
            torsionMeterRdg: "0.0",
            maxRpmAchieved: "0",
            nonOpsSince: "",
            lastCalibrationOn: "",
            nextCalibrationDue: ""
          })
        );

        // Tab 5: ICCP, H2S Sensors, STP, MFFS.
        this.iccpData = this.reconcileEquipmentRows(
          byCategory(["29"]), equipmentIdOf, this.iccpData,
          (ic, idx): IccpItem => ({
            srNo: idx + 1,
            nomenclature: ic.srar_txt || ic.nomenclature || "ICCP System",
            eqptCode: `ICCP-0${idx + 1}`,
            locOnBoard: "Aft Compartment",
            opsNonOps: "Ops",
            nonOpsSince: ""
          })
        );

        this.h2sSensorData = this.reconcileEquipmentRows(
          byCategory(["20"]), equipmentIdOf, this.h2sSensorData,
          (h, idx): H2SSensorItem => ({
            srNo: idx + 1,
            nomenclature: h.srar_txt || h.nomenclature || "H2S Sensor",
            eqptCode: `H2S-0${idx + 1}`,
            locOnBoard: "Bilge Space",
            opsNonOps: "Ops",
            nonOpsSince: "",
            lastCalibratedOn: "",
            nextCalibration: ""
          })
        );

        this.stpData = this.reconcileEquipmentRows(
          byCategory(["10"]), equipmentIdOf, this.stpData,
          (s, idx): StpItem => ({
            srNo: idx + 1,
            nomenclature: s.srar_txt || s.nomenclature || "Sewage Treatment Plant",
            eqptCode: `STP-0${idx + 1}`,
            locOnBoard: "AMR No. 2",
            status: "SAT",
            effluentTestDate: "",
            remarks: ""
          })
        );

        this.mffsData = this.reconcileEquipmentRows(
          byCategory(["30"]), equipmentIdOf, this.mffsData,
          (m, idx): MagazineItem => ({
            srNo: idx + 1,
            nomenclature: m.srar_txt || m.nomenclature || "Magazine Sprinkling System",
            eqptCode: `MFFS-0${idx + 1}`,
            locOnBoard: "Magazine Space",
            status: "SAT",
            lastTrialsTaken: "",
            nextTrialsDue: ""
          })
        );

        // Tab 6: Centrifuge.
        this.lubOilFuelCentrifuge = this.reconcileEquipmentRows(
          byCategory(["24"]), equipmentIdOf, this.lubOilFuelCentrifuge,
          (c, idx): CentrifugeItem => {
            const nome = c.srar_txt || c.nomenclature || c.equipment_desc || "Purifier";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `PUR-0${idx + 1}`, serNo: `P-${c.id}`,
              locOnBoard: "Purifier Room", opsNonOps: "Ops", nonOpsSince: "", lastCalibratedOn: "", nextCalibration: ""
            };
          }
        );

        // Tab 8 (DGUF running hours) & Tab 9 (FPT Diesel Alternator load) both draw
        // from the same Diesel Alternator category — one linked generator, two
        // different sets of monthly readings.
        const dgAlternators = byCategory(["2"]);
        this.dgufGeneratorData = this.reconcileEquipmentRows(
          dgAlternators, equipmentIdOf, this.dgufGeneratorData,
          (d, idx): DgufGeneratorItem => ({
            srNo: idx + 1,
            eqptSerNo: `DA-${d.id}`,
            eqptCode: `DA-0${idx + 1}`,
            eqptName: d.srar_txt || d.nomenclature || d.equipment_desc || `Diesel Alternator No. ${idx + 1}`,
            locOnBoard: "",
            daNo: `DA-${idx + 1}`,
            rhSeaAnchorage: "00:00",
            rhHarbour: "00:00",
            totalRhMonth: "00:00"
          })
        );
        this.fptDieselGeneratorLoad = this.reconcileEquipmentRows(
          dgAlternators, equipmentIdOf, this.fptDieselGeneratorLoad,
          (d, idx): FptDieselGeneratorLoadItem => {
            const nome = d.srar_txt || d.nomenclature || d.equipment_desc || `Diesel Alternator No. ${idx + 1}`;
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `DA-0${idx + 1}`, location: `AMR No. ${idx + 1}`,
              eqptSerNo: `DA-${d.id}`, date: "", occasionReason: "", ratedLoad: "0", maxLoadAchieved: "0",
              conductedBy: "", lastEhmTrialsDate: "", remarks: ""
            };
          }
        );

        // Tab 9: Full Power Trials - Main Engine (Equipment Wise).
        this.fptMainEngineSpecific = this.reconcileEquipmentRows(
          byCategory(["1"]), equipmentIdOf, this.fptMainEngineSpecific,
          (m, idx): FptMainEngineSpecificItem => {
            const nome = m.srar_txt || m.nomenclature || m.equipment_desc || "Main Engine";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `ME-0${idx + 1}`, locOnBoard: "Engine Room",
              serNo: `ME-${m.id}`, fuelRackDbl: "0", fciThrottleMarking: "0", lastEhmTrialsDate: "",
              pitch: "0", maxRpm: "0", ratedPower: "0", maxAchievedPower: "0", remarks: ""
            };
          }
        );

        // Tab 7: Injector FIP Calibration/Replacement and Status of Safety Device
        // Checks both cover Main Engines + Diesel Alternators together.
        const meAndDgEquipment = byCategory(["1", "2"]);
        this.injectorFipCalibration = this.reconcileEquipmentRows(
          meAndDgEquipment, equipmentIdOf, this.injectorFipCalibration,
          (eq, idx): InjectorFipItem => {
            const isDg = String(eq.universal_id_ch_master_equipment_type ?? "") === "2";
            const nome = eq.srar_txt || eq.nomenclature || eq.equipment_desc || (isDg ? `Diesel Alternator No. ${idx + 1}` : `Main Engine No. ${idx + 1}`);
            return {
              eqptName: nome,
              nomenclature: isDg ? "Diesel Generator" : nome,
              eqptCode: `${isDg ? "DA" : "ME"}-0${idx + 1}`,
              locOnBoard: "Engine Room",
              fipInMonth: "00:00",
              rhSinceInstallation: "00:00",
              hrsBelow30: "0",
              hrs30to50: "0",
              hrs50to70: "0",
              hrs70to100: "0",
              lubOilConsCurrentMonth: "00:00",
              dateOfInjectorCalibration: "",
              occasionsReplacement: "0",
              inOutWhichReplaced: "",
              fuelConsumptionTons: "0",
              remarks: ""
            };
          }
        );
        this.safetyDeviceChecks = this.reconcileEquipmentRows(
          meAndDgEquipment, equipmentIdOf, this.safetyDeviceChecks,
          (eq, idx): SafetyDeviceItem => {
            const isDg = String(eq.universal_id_ch_master_equipment_type ?? "") === "2";
            const nome = eq.srar_txt || eq.nomenclature || eq.equipment_desc || (isDg ? `Diesel Alternator No. ${idx + 1}` : `Main Engine No. ${idx + 1}`);
            return {
              eqptName: nome,
              nomenclature: nome,
              eqptSerNo: `${isDg ? "DA" : "ME"}-${eq.id}`,
              eqptCode: `${isDg ? "DA" : "ME"}-0${idx + 1}`,
              locOnBoard: "Engine Room",
              sdcConductedBy: "",
              dateOfSdc: "",
              sfcGmsKWh: "",
              lastSfcTrialDate: "",
              displacementDuringSfc: "",
              status: "SAT"
            };
          }
        );

        // Tab 7: Diesel Reduction Gear — CMMS category 4 ("Reduction Gear"), the
        // main diesel engine's RG. Only hours this month and hours since
        // installation are returned for it.
        this.dieselReductionGear = this.reconcileEquipmentRows(
          byCategory(["4"]), equipmentIdOf, this.dieselReductionGear,
          (r): DieselReductionGearItem => ({
            // Every column here is printed straight from the equipment master, the
            // way the CMMS form shows it — no synthesised codes or placeholder
            // locations, since the linked ShipEquipment carries all five.
            eqptName: r.name || r.srar_txt || r.equipment_desc || "Reduction Gear",
            nomenclature: r.nomenclature || r.name || "",
            eqptCode: r.equipment_code || "",
            locOnBoard: r.location_on_board && r.location_on_board !== "-" ? r.location_on_board : "",
            serNo: r.serial_no && r.serial_no !== "-" ? r.serial_no : "",
            hrsForMonth: "0:00",
            hrsSinceInstallation: "0:00"
          })
        );

        // Tab 10: Gas Turbine & its Reduction Gear (plain + gas-turbine-specific).
        this.gasTurbineExploitation = this.reconcileEquipmentRows(
          byCategory(["19"]), equipmentIdOf, this.gasTurbineExploitation,
          (g, idx): GasTurbineExploitationItem => {
            const nome = g.srar_txt || g.nomenclature || g.equipment_desc || "Gas Turbine";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `GT-0${idx + 1}`, locOnBoard: "Engine Room",
              serNo: `GT-${g.id}`, totalRhInMonth: "0:00", rhEngine1: "0:00", rhEngine2: "0:00", totalRhSi: "0:00",
              status: "Ops", nonOpsSince: "", lastCalibrationDate: "", lastEhmTrialDate: "", lastFptDate: "", fuelExploitation: "0.0",
              rhRegime1InMonth: "0:00", rhRegime2InMonth: "0:00", rhRegime3InMonth: "0:00", gslEngine1_1_0to1_25: "0:00",
              rhRegime1Si: "0:00", rhRegime2Si: "0:00", rhRegime3Si: "0:00", gslEngine2_1_0to1_25: "0:00",
              unscheduledEngagement: "None", noOfOccasion: "0", noOfRepOrders: "0", gslChemQty: "0.0",
              noOfStopOrdersSi: "0", lastChemClg: ""
            };
          }
        );

        // Category 35 only — plain "Reduction Gear" (4) is the *diesel* engine's RG
        // and belongs to Tab 7's own table, not here.
        this.gtReductionGear = this.reconcileEquipmentRows(
          byCategory(["35"]), equipmentIdOf, this.gtReductionGear,
          (r, idx): GtReductionGearItem => {
            const nome = r.srar_txt || r.nomenclature || r.equipment_desc || "Reduction Gear";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `RG-0${idx + 1}`, locOnBoard: "Engine Room",
              eqptSerNo: `RG-${r.id}`, totalRhInMonth: "0:00", totalRhsi: "0:00",
              hoRegimeBelow0_25: "0:00", hoRegimeBelow0_25Si: "0:00",
              hoRegime0_25to0_5: "0:00", hoRegime0_25to0_5Si: "0:00",
              hoRegime0_5to0_75: "0:00", hoRegime0_5to0_75Si: "0:00",
              slidingHours0_25: "0:00", slidingHours0_25Si: "0:00",
              serviceLife: "0:00", serviceLifeSi: "0:00",
              routineRegime1: "0:00", routineRegime1Si: "0:00",
              routineRegime2: "0:00", routineRegime2Si: "0:00",
              routineRegime3: "0:00", routineRegime3Si: "0:00",
              routineRegime4: "0:00", routineRegime4Si: "0:00"
            };
          }
        );

        // Tab 11: Gas Turbine Generator & its own (GTG-specific) Reduction Gear.
        this.gtgExploitationData = this.reconcileEquipmentRows(
          byCategory(["34"]), equipmentIdOf, this.gtgExploitationData,
          (g, idx): GtgExploitationItem => {
            const nome = g.srar_txt || g.nomenclature || g.equipment_desc || "GTG";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `GTG-0${idx + 1}`, locOnBoard: "GTG Room",
              serNo: `GTG-${g.id}`, rhInSea: "0:00", rhInHarbour: "0:00", totalRhInMonth: "0:00", totalRhsi: "0:00",
              noOfColdStarts: 0, noOfColdStartsSi: 0, noOfHotStarts: 0, noOfHotStartsSi: 0,
              noOfBatteryHotStarts: 0, noOfBatteryHotStartsSi: 0, noOfBatteryColdStarts: 0, noOfBatteryColdStartsSi: 0,
              lastChemClgDateReason: ""
            };
          }
        );

        this.gtgReductionGear = this.reconcileEquipmentRows(
          byCategory(["36"]), equipmentIdOf, this.gtgReductionGear,
          (r, idx): GtgReductionGearItem => {
            const nome = r.srar_txt || r.nomenclature || r.equipment_desc || "GTG Reduction Gear";
            return {
              eqptName: nome, nomenclature: nome, eqptCode: `GTG-RG-0${idx + 1}`, locOnBoard: "GTG Room",
              serNo: `GTGRG-${r.id}`, rgRunningHours: "0", noOfHotStarts: 0, noOfColdStarts: 0,
              rhInHarbour: "0", rhInSea: "0", inMonthsSi: "0"
            };
          }
        );

        // Tab 13: R/H Extension — Main Engine + Diesel Alternator.
        this.mainEngineRHExtensions = this.reconcileEquipmentRows(
          byCategory(["1"]), equipmentIdOf, this.mainEngineRHExtensions,
          (m, idx): RhExtensionItem => {
            const nome = m.srar_txt || m.nomenclature || m.equipment_desc || `Main Engine No. ${idx + 1}`;
            return {
              eqptName: nome,
              nomenclature: nome,
              location: "Engine Room",
              serNo: `ME-${m.id}`,
              onRoutine: "",
              rhDuringTrial: "",
              trialConductedBy: "",
              authorityLetter: null,
              authorityLetterRef: "",
              rhdi: "",
              rhExtensionGranted: "",
              rhLeftExpiry: ""
            };
          }
        );
        this.dieselAlternatorRHExtensions = this.reconcileEquipmentRows(
          byCategory(["2"]), equipmentIdOf, this.dieselAlternatorRHExtensions,
          (d, idx): RhExtensionItem => {
            const nome = d.srar_txt || d.nomenclature || d.equipment_desc || `Diesel Alternator No. ${idx + 1}`;
            return {
              eqptShipName: `DA-${idx + 1}`,
              eqptName: nome,
              nomenclature: nome,
              location: "",
              serNo: `DA-${d.id}`,
              onRoutine: "",
              rhDuringTrial: "",
              trialConductedBy: "",
              authorityLetter: null,
              authorityLetterRef: "",
              rhdi: "",
              rhExtensionGranted: "",
              rhLeftExpiry: ""
            };
          }
        );

        if (!this.srarId) {
          this.applyInjectorFipCarryForward();
          this.applyGasTurbineCarryForward();
          this.applyReductionGearCarryForward();
          this.applyDieselReductionGearCarryForward();
          this.applyGtgCarryForward();
          this.applyGtgReductionGearCarryForward();
          this.applyFptMainEngineCarryForward();
          this.applyRhExtensionCarryForward();
          this.loadEquipmentRoutineOptions();
        }
      },
      error: (err: unknown) => console.error("Failed to load configured SRAR Master Records:", err)
    });
  }

  onFillDetails(): void {
    const existingRecord = this.findExistingRecordForSelection();
    if (existingRecord?.id) {
      this.srarId = Number(existingRecord.id);
      this.loadReportDetails(this.srarId);
    } else {
      const previousRecord = this.findPreviousMonthRecordForSelection();
      if (previousRecord && !Boolean(previousRecord.cmms_sync_status ?? previousRecord.cmmsSyncStatus ?? false)) {
        const previous = this.getPreviousMonthYear();
        this.appService.openAlert(
          "Previous Month Sync Required",
          `Please sync ${this.months[previous.month - 1]} ${previous.year} with CMMS before adding ${this.selectedMonth()} ${this.selectedYear()}.`
        );
        return;
      }
      this.resetFormForNewReport();
    }
    this.activeSubTab.set(1);
    this.showDetails.set(true);
  }

  backToSelect(): void {
    this.showDetails.set(false);
  }

  onGridReady(event: GridReadyEvent): void {
    this.gridApi = event.api;
    if (event?.api) {
      event.api.paginationGetPageSize();
    }
  }

  onCellClicked(event: CellCallbackParams): void {
    if (event.colDef?.headerName === "Action") {
      const domEvent = (event as Record<string, unknown>)['event'] as MouseEvent | undefined;
      const target = domEvent?.target as HTMLElement | null;

      const syncBtn = target?.closest('.grid-action-sync') as HTMLButtonElement | null;
      if (syncBtn) {
        const row = event.data as SrarRecord | undefined;
        const isSynced = Boolean(row?.cmms_sync_status ?? row?.cmmsSyncStatus ?? false);
        const canPushToCmms = this.isCoUser() && Boolean(row?.co_approved) && !isSynced;
        if (!canPushToCmms || syncBtn.hasAttribute('disabled') || syncBtn.classList.contains('disabled')) {
          return;
        }
        this.pushApprovedReportToCmms(row);
        return;
      }

      const exportBtn = target?.closest('.grid-action-export') as HTMLButtonElement | null;
      if (exportBtn) {
        if (this.isExporting() || exportBtn.hasAttribute('disabled') || exportBtn.classList.contains('disabled')) {
          return;
        }
        const row = event.data as SrarRecord | undefined;
        this.exportSrarReport(row);
        return;
      }

      // Scoped to the button, like the two above — a click on empty space in the
      // Action cell should do nothing rather than open a report.
      const editBtn = target?.closest('.grid-action-edit') as HTMLButtonElement | null;
      if (editBtn) {
        this.openRecord(event.data as SrarRecord | undefined);
      }
    }
  }

  /**
   * Opens the report belonging to a specific grid row.
   *
   * The period selector at the top of the page and this grid are two independent
   * ways of choosing a return, so Edit must follow the row rather than the selector
   * — otherwise clicking Edit on, say, March 2024 opens whatever the selector happens
   * to hold (it defaults to the current month), and when no report exists for that
   * period it silently starts a blank *new* one instead. Syncing the selector to the
   * row first also keeps everything downstream that reads it — the carry-forward
   * lookup, the previous-month sync check, and the month/year written into the save
   * payload — pointed at the return actually on screen.
   */
  openRecord(row: SrarRecord | undefined): void {
    if (!row?.id) {
      this.onFillDetails();
      return;
    }
    this.applySelectedPeriod(row.month, row.year);
    this.srarId = Number(row.id);
    this.loadReportDetails(this.srarId);
    this.activeSubTab.set(1);
    this.showDetails.set(true);
  }

  /** Points the period selector at a given month/year, accepting either a month
   *  number ("3") or a month name ("March") as the grid and API both supply. */
  private applySelectedPeriod(month: string | number | undefined, year: string | number | undefined): void {
    const monthNo = this.getMonthNumber(month);
    this.selectedMonth.set(this.months[monthNo - 1]);
    const yearNo = Number(year);
    if (!isNaN(yearNo) && yearNo > 0) {
      this.selectedYear.set(yearNo);
    }
  }

  setSubTab(subTabId: number) {
    this.activeSubTab.set(subTabId);
  }

  goToPreviousSubTab(): void {
    if (this.activeSubTab() > 1) {
      this.activeSubTab.set(this.activeSubTab() - 1);
    } else {
      this.backToSelect();
    }
  }

  saveAndNext() {
    if (this.activeSubTab() < 15) {
      this.activeSubTab.set(this.activeSubTab() + 1);
    } else if (this.activeSubTab() === 15) {
      this.submitSRARWithValidation();
    }
  }

  saveDraftProgress(callback?: (success: boolean) => void) {
    const currentStep = this.activeSubTab();
    const errorMsg = this.getStepValidationError(currentStep);

    if (errorMsg) {
      this.appService.openAlert(
        "Validation Error",
        `Cannot save Step ${currentStep}: ${errorMsg}`
      );
      if (callback) callback(false);
      return;
    }

    this.saveReportPayload(false, (success) => {
      if (success) {
        // One toast only. saveCompositeSrar opts out of the interceptor's automatic toast,
        // so this is the single confirmation for a draft save.
        this.toaster.success(`Step ${currentStep} saved.`);
      }
      if (callback) callback(success);
    });
  }

  submitSRARWithValidation() {
    // Collected with the reason for each step: "complete mandatory fields in Step(s)
    // [2, 6]" alone left the user hunting a tab of read-only rosters for a field that
    // may not even be editable there.
    const invalid: { step: number; reason: string }[] = [];
    for (let s = 1; s <= 14; s++) {
      const reason = this.getStepValidationError(s);
      if (reason) {
        invalid.push({ step: s, reason });
      }
    }

    if (invalid.length > 0) {
      const details = invalid.map(i => `Step ${i.step}: ${i.reason}`).join("\n");
      this.appService.openAlert(
        "Incomplete Report",
        `Please resolve the following before submitting to CO.\n\n${details}`,
        () => {
          this.activeSubTab.set(invalid[0].step);
        }
      );
      return;
    }

    this.toggleEoDetailsModal(true);
  }

  toggleEoDetailsModal(show: boolean) {
    this.showEoDetailsModal.set(show);
  }

  isEoDetailsValid(): boolean {
    return !!(
      this.eoDetails.writerContactNo?.trim() &&
      this.eoDetails.rank?.trim() &&
      this.eoDetails.name?.trim() &&
      this.eoDetails.personalNo?.trim() &&
      this.eoDetails.contactNo?.trim()
    );
  }

  submitSRARFromModal() {
    if (!this.isEoDetailsValid()) {
      this.appService.openAlert("Validation Error", "Please fill in all required EO Details fields before sending.");
      return;
    }
    // The "Send To: CO" tick is what actually sets send_to_co on the header, and it
    // starts unticked. Sending without it saved the return with send_to_co = false —
    // the view closed and reported success, but the return never reached the CO and the
    // CO's Approve button never appeared for it.
    if (!this.eoDetails.sendToCo) {
      this.appService.openAlert("Validation Error", 'Please tick "CO" under Send To before sending this SRAR.');
      return;
    }
    this.toggleEoDetailsModal(false);
    this.saveReportPayload(true, (success) => {
      if (success) {
        // this.appService.openAlert("Success", "SRAR Report Finalized and Submitted to CO successfully", () => {
        //   this.showDetails.set(false);
        //   this.loadDashboard();
        //   this.activeSubTab.set(1);
        // });
        this.currentReportSentToCo.set(true);
        this.showDetails.set(false);
        this.loadDashboard();
        this.activeSubTab.set(1);
      }
    });
  }

  approveSrarAsCo(): void {
    if (!this.srarId) {
      this.appService.openAlert("Approval Error", "Please open a submitted SRAR before approving.");
      return;
    }
    if (!this.coApprovalChecked()) {
      this.appService.openAlert("Approval Required", "Please tick CO Approval before approving this SRAR.");
      return;
    }

    // `action: "approve"` states the intent outright. This used to post the same
    // `{ send_to_co: true }` the ship's own submit sends, leaving the API to guess
    // approval from the caller's role — and when its role check didn't recognise the
    // caller as CO it took the *submit* branch instead, which sets co_approved back to
    // false. The response was still `success: true`, so the UI reported an approval that
    // had not happened and the CMMS sync button stayed disabled.
    this.srarService.finalizeReport(this.srarId, { action: "approve" }).subscribe({
      next: (res) => {
        if (res && res["success"] === false) {
          this.appService.openAlert("Approval Error", res.message || "Unable to approve SRAR.");
          return;
        }
        // Taken from the response rather than assumed: if the server did not actually
        // approve, the UI must not claim it did.
        if (res && res["co_approved"] === false) {
          this.appService.openAlert(
            "Approval Error",
            "The server did not record this approval. Please check that your account holds the CO role and try again."
          );
          this.loadDashboard();
          return;
        }
        this.currentReportSentToCo.set(true);
        this.currentReportCoApproved.set(true);
        this.toaster.success("SRAR approved by CO. CMMS sync is now enabled.");
        this.loadDashboard();
        this.loadReportDetails(this.srarId as number);
      },
      error: (err: HttpErrorLike) => {
        const errorMsg = err?.error?.message || err?.message || "Unable to approve SRAR.";
        this.appService.openAlert("Approval Error", errorMsg);
      }
    });
  }

  nextSubTab() {
    if (this.activeSubTab() < 15) {
      this.activeSubTab.set(this.activeSubTab() + 1);
    }
  }

  prevSubTab() {
    if (this.activeSubTab() > 1) {
      this.activeSubTab.set(this.activeSubTab() - 1);
    }
  }

  // --- Field Validation & Sanitization Helpers ---
  allowOnlyNumbers(event: KeyboardEvent): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    if ([8, 9, 13, 27, 46, 37, 38, 39, 40].includes(charCode)) {
      return true;
    }
    if ((charCode >= 48 && charCode <= 57) || (charCode >= 96 && charCode <= 105)) {
      return true;
    }
    event.preventDefault();
    return false;
  }

  allowOnlyDecimals(event: KeyboardEvent, currentValue: string | number): boolean {
    const charCode = event.which ? event.which : event.keyCode;
    if ([8, 9, 13, 27, 46, 37, 38, 39, 40].includes(charCode)) {
      return true;
    }
    if ((charCode === 190 || charCode === 110) && !String(currentValue || "").includes(".")) {
      return true;
    }
    if ((charCode >= 48 && charCode <= 57) || (charCode >= 96 && charCode <= 105)) {
      return true;
    }
    event.preventDefault();
    return false;
  }

  /**
   * Rejects a non-numeric entry and says so, for fields that hold a measurement.
   *
   * The keypress guards (allowOnlyNumbers/allowOnlyDecimals) stop letters being typed,
   * but nothing stopped a paste, an autofill or a browser-restored value — those reached
   * the save mapping's `Number(...)`, became NaN and were written as null, silently
   * emptying a figure the operator believed they had entered. This clears the bad value
   * where the operator can see it happen and names the field in the message.
   *
   * `decimal: false` is for counts and running hours that are whole numbers.
   */
  onNumericEntry(
    obj: Record<string, FormItemValue>,
    key: string,
    label: string,
    decimal = true
  ): void {
    const raw = String(obj[key] ?? "").trim();
    if (!raw) return;

    const pattern = decimal ? /^\d+(\.\d+)?$/ : /^\d+$/;
    if (pattern.test(raw)) {
      obj[key] = raw;
      return;
    }

    obj[key] = "";
    this.appService.openAlert(
      "Validation Warning",
      decimal
        ? `${label} accepts numbers only.`
        : `${label} accepts whole numbers only.`
    );
  }

  sanitizeNumericField(obj: Record<string, unknown>, key: string, isDecimal = false): void {
    if (!obj || !key) return;
    const val = String(obj[key] || "");
    if (isDecimal) {
      let cleaned = val.replace(/[^0-9.]/g, "");
      const parts = cleaned.split(".");
      if (parts.length > 2) {
        cleaned = parts[0] + "." + parts.slice(1).join("");
      }
      obj[key] = cleaned;
    } else {
      obj[key] = val.replace(/\D/g, "");

    }
  }

  // --- Calculation & Normalization Helpers ---
  get selectedMonthStartDate(): string {
    const monthNo = this.getMonthNumber(this.selectedMonth());
    const year = Number(this.selectedYear()) || new Date().getFullYear();
    return `${year}-${String(monthNo).padStart(2, "0")}-01`;
  }

  get selectedMonthEndDate(): string {
    const monthNo = this.getMonthNumber(this.selectedMonth());
    const year = Number(this.selectedYear()) || new Date().getFullYear();
    const lastDay = new Date(year, monthNo, 0).getDate();
    return `${year}-${String(monthNo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  ngAfterViewChecked(): void {
    this.standardizeSrarDateInputs();
  }

  // Today's date (YYYY-MM-DD, local) — the ceiling for the range-checked fields below,
  // all three of which record something that already happened.
  private get todayDateStr(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  private get maxCheckedDate(): string {
    const monthEndDate = this.selectedMonthEndDate;
    const today = this.todayDateStr;
    return monthEndDate < today ? monthEndDate : today;
  }

  /**
   * Applies the "within the reporting month, not in the future" rule — but only to the
   * date fields carrying `data-srar-date-range` (Tab 1's Max Speed Date and Tab 3's Ship
   * Activity From/To). Those three describe something that happened during the month this
   * return covers, so a date outside it is an entry error.
   *
   * Every other date on the form is left free. They record events that legitimately fall
   * outside the reporting month — a last calibration or retubing from years back, a next
   * inspection due next year, the date of a chemical cleaning — and clamping them to the
   * month meant the picker refused the only correct answer and blanked what was typed.
   *
   * The marker is matched with closest() so it can sit either on the native input or on
   * an <app-input-field> wrapper, which renders its own input internally.
   */
  /**
   * Opens the date picker from anywhere in the field, not just its calendar icon.
   *
   * A native `input[type=date]` only pops the calendar when the little icon is hit —
   * clicking the dd/mm/yyyy text just puts a caret in a segment, so on these dense
   * tables the field reads as dead unless you land on a ~16px target. `showPicker()`
   * is the supported way to open it programmatically; it throws if the browser
   * doesn't allow the call (not user-initiated, or unsupported), so it's guarded and
   * the field still works as a plain typed-in date if it fails.
   */
  private attachDatePickerOnFieldClick(input: HTMLInputElement): void {
    if (input.dataset["srarDatePicker"]) return;
    input.dataset["srarDatePicker"] = "true";

    const open = () => {
      if (input.readOnly || input.disabled) return;
      try {
        input.showPicker?.();
      } catch {
        // Browser refused the call — typing into the field still works.
      }
    };

    this.renderer.listen(input, "click", open);
    // Keyboard users get it too: tabbing into the field opens the picker, matching
    // what app-input-field already does on focus for its own date inputs.
    this.renderer.listen(input, "focus", open);
  }

  private standardizeSrarDateInputs(): void {
    const minDate = this.selectedMonthStartDate;
    const maxDate = this.maxCheckedDate;
    const host = this.hostElement.nativeElement as HTMLElement;
    const dateInputs = host.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
    dateInputs.forEach((input: HTMLInputElement) => {
      this.attachDatePickerOnFieldClick(input);

      if (!input.closest("[data-srar-date-range]")) {
        // Free-choice field. Strip any bounds a previous pass left on this DOM node —
        // Angular reuses nodes across renders, so not setting them is not enough.
        this.renderer.removeAttribute(input, "min");
        this.renderer.removeAttribute(input, "max");
        return;
      }

      this.renderer.setAttribute(input, "min", minDate);
      this.renderer.setAttribute(input, "max", maxDate);

      if (!input.dataset["srarDateGuard"]) {
        this.renderer.listen(input, "change", () => this.validateSrarDateInput(input));
        input.dataset["srarDateGuard"] = "true";
      }
      this.validateSrarDateInput(input, false);
    });
  }

  private validateSrarDateInput(input: HTMLInputElement, showAlert = true): void {
    const value = input.value;
    if (!value) return;

    const minDate = this.selectedMonthStartDate;
    const maxDate = this.maxCheckedDate;
    if (value >= minDate && value <= maxDate) return;

    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (showAlert) {
      const message = value > this.todayDateStr
        ? "Date cannot be a future date."
        : `Date must be within ${this.selectedMonth()} ${this.selectedYear()}.`;
      this.appService.openAlert("Validation Warning", message);
    }
  }

  getMaxHoursForSelectedMonth(): { maxHours: number; days: number; monthName: string; year: number } {
    const rawMonth = this.selectedMonth();
    const year = Number(this.selectedYear()) || new Date().getFullYear();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    let monthNum = 8;
    if (typeof rawMonth === "number") {
      monthNum = rawMonth;
    } else {
      const parsed = parseInt(String(rawMonth), 10);
      if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
        monthNum = parsed;
      } else {
        const foundIndex = monthNames.findIndex(
          m => m.toLowerCase().startsWith(String(rawMonth).toLowerCase())
        );
        if (foundIndex !== -1) monthNum = foundIndex + 1;
      }
    }

    const days = new Date(year, monthNum, 0).getDate();
    const maxHours = days * 24;
    const monthName = monthNames[monthNum - 1] || "Selected Month";

    return { maxHours, days, monthName, year };
  }

  normalizeHoursMinutes(obj: Record<string, FormItemValue> | RunningParameters, hrsProp: string, minProp: string) {
    let hrs = Number.parseInt(String(obj[hrsProp] || 0), 10) || 0;
    let mins = Number.parseInt(String(obj[minProp] || 0), 10) || 0;
    if (mins >= 60) {
      const extraHrs = Math.floor(mins / 60);
      mins = mins % 60;
      hrs += extraHrs;
      obj[hrsProp] = hrs;
      obj[minProp] = mins;
    }

    const { maxHours, days, monthName, year } = this.getMaxHoursForSelectedMonth();
    if (hrs > maxHours) {
      this.appService.openAlert(
        "Validation Warning",
        `Entered hours (${hrs} hrs) exceed maximum allowed limit of ${maxHours} hours for ${monthName} ${year} (${days} days). Value reset to ${maxHours} hrs.`
      );
      obj[hrsProp] = maxHours;
    }

    if ((obj as unknown) === this.runningParameters) {
      this.updateSinceComm();
    }
  }

  // Seeds the "since commissioning" baseline (the ship-life total to add this month's
  // own hours/distance onto) and recomputes the displayed running total from it — used
  // both for a brand-new report (previous month's total via carry-forward) and an
  // existing one (see seedSinceCommBaselineForExistingReport).
  private applySinceCommBaseline(hr: number, min: number, dist: number): void {
    this.runningParameters.baselineSinceCommHours = hr;
    this.runningParameters.baselineSinceCommMinutes = min;
    this.runningParameters.baselineSinceCommDistance = dist;
    this.updateSinceComm();
    // This component is OnPush and runningParameters is a plain object, not a signal —
    // when this runs from an HTTP subscribe callback with no signal write alongside it
    // (e.g. a ship with no previous equipment carry-forward data, so
    // applyEquipmentHoursCarryForward() returns before touching the equipments signal),
    // nothing would otherwise mark this view dirty and the computed value would never
    // reach the screen even though it's correct in memory.
    this.cdr.markForCheck();
  }

  // Seeds an existing report's "since commissioning" baseline from the SERVER's
  // cumulative total for every return before this one — never from the header's own
  // stored total.
  //
  // The stored column is a snapshot written at save time (see constructCompositePayload),
  // so trusting it meant a report saved while the baseline was wrong kept that wrong
  // baseline forever: save a report showing 0:00, reopen it, and it read 0:00 straight
  // back out of its own header. Recomputing from the returns on file instead makes the
  // value self-healing — the same period always resolves to the same baseline, and
  // fixing the data once fixes every report that reads it.
  private seedSinceCommBaselineForExistingReport(h: Record<string, unknown>): void {
    const month = this.getMonthNumber(h["srar_month"] as string | number | undefined);
    const year = Number(h["srar_year"]) || this.selectedYear();
    this.srarService.getCarryForward(this.shipId, month, year).subscribe({
      next: (cf) => {
        this.applySinceCommBaseline(
          Number(cf.since_commissioning_hours_last_month_hr ?? 0) || 0,
          Number(cf.since_commissioning_hours_last_month_min ?? 0) || 0,
          Number(cf.since_commissioning_distance_last_month ?? 0) || 0
        );
        // Tab 1's "Hrs Since Installation" comes from the same call — an existing
        // report that has no saved Tab 1 rows of its own (or whose equipment was
        // added later) otherwise showed 0:00 against equipment CMMS has real
        // running hours for.
        this.carryForward = cf;
        this.applyEquipmentHoursCarryForward();
      }
    });
  }

  updateSinceComm() {
    const rh = this.runningParameters;
    const baseHrs = Number.parseInt(String(rh.baselineSinceCommHours || 0), 10) || 0;
    const baseMins = Number.parseInt(String(rh.baselineSinceCommMinutes || 0), 10) || 0;
    const baseDist = Number.parseFloat(String(rh.baselineSinceCommDistance || 0)) || 0;

    const monthHrs = Number.parseInt(String(rh.duringMonthHours || 0), 10) || 0;
    const monthMins = Number.parseInt(String(rh.duringMonthMinutes || 0), 10) || 0;
    const monthDist = Number.parseFloat(String(rh.duringMonthDistance || 0)) || 0;

    let totalMins = baseMins + monthMins;
    const totalHrs = baseHrs + monthHrs + Math.floor(totalMins / 60);
    totalMins = totalMins % 60;

    rh.sinceCommHours = `${totalHrs}:${String(totalMins).padStart(2, "0")}`;

    const totalDist = baseDist + monthDist;
    rh.sinceCommDistance = totalDist.toFixed(2);

    const monthlyUnderway = `${monthHrs}:${String(monthMins).padStart(2, "0")}`;
    this.dgufRunningHoursData.hrsUnderway = monthlyUnderway;
    this.recalculateDgufSeaHarbourSplit();
    this.eefData.hoursUnderway = monthlyUnderway;
  }

  // Fields a row may only carry while it is Ops. Mirrors srar/ops_status.py on the
  // backend, which enforces the same rule on save -- this half is what stops the
  // operator typing into a dead field in the first place.
  //
  // Readings were missing from this list: a row switched to Non-Ops or Not Held kept
  // its torsion meter reading and max RPM, and saved them, so a return went out
  // carrying figures for equipment the same row declared absent.
  static readonly OPS_ONLY_FIELDS = [
    "torsionMeterRdg",
    "maxRpmAchieved",
    "lastCalibrationOn",
    "nextCalibrationDue",
    "lastCalibratedOn",
    "nextCalibration",
    "calibrationDate",
    "nextCalibrationDueDate",
    "lastTrialsTaken",
    "nextTrialsDue",
    "effluentTestDate",
  ];

  // True when the row carries a status that positively says it is not Ops. An
  // unanswered status is not one: it is the state a freshly added row starts in, and
  // blanking on it would wipe what the operator is part way through typing.
  isNotOps(row: Record<string, unknown>): boolean {
    const status = String(row?.["opsNonOps"] ?? row?.["status"] ?? "").trim();
    return status === "Non-Ops" || status === "Not Held" || status === "UNSAT";
  }

  onStatusChange(row: Record<string, unknown>) {
    const status = String(row["opsNonOps"] || row["status"] || "");
    if (status === "Ops" || status === "Operational" || status === "SAT") {
      row["nonOpsSince"] = "";
    }
    if (this.isNotOps(row)) {
      for (const field of SrarTransactionComponent.OPS_ONLY_FIELDS) {
        if (field in row) row[field] = "";
      }
    }
  }

  // Test Kits / Centrifuge: Next Calibration Due must be after Last Calibration —
  // both are plain "YYYY-MM-DD" date-input values, so lexicographic comparison works.
  onCalibrationDateChange(row: Record<string, unknown>, lastField: string, nextField: string): void {
    const last = String(row[lastField] || "");
    const next = String(row[nextField] || "");
    if (last && next && next <= last) {
      row[nextField] = "";
      this.appService.openAlert("Validation Warning", "Next Calibration Due Date must be after the Last Calibration Date.");
    }
  }

  // Shared by the initial carry-forward/load population and the monthly-hours
  // (change) handler, so "Hrs Since Installation" is correct as soon as the row
  // appears on screen instead of only after the user touches its hours field.
  private computeCumulativeHHMM(prevHours: number | string, monthlyHours: string): string {
    const prevParts = String(prevHours || "0:00").split(":");
    const monthParts = String(monthlyHours || "0:00").split(":");

    const prevHrs = Number.parseInt(prevParts[0], 10) || 0;
    const prevMins = Number.parseInt(prevParts[1], 10) || 0;

    const monthHrs = Number.parseInt(monthParts[0], 10) || 0;
    const monthMins = Number.parseInt(monthParts[1], 10) || 0;

    let totalMins = prevMins + monthMins;
    const totalHrs = prevHrs + monthHrs + Math.floor(totalMins / 60);
    totalMins = totalMins % 60;

    return `${totalHrs}:${String(totalMins).padStart(2, "0")}`;
  }

  calculateEquipmentCumulative(eq: EquipmentItem) {
    if (!eq.monthlyHours) eq.monthlyHours = "0:00";
    if (!eq.prevHours) eq.prevHours = "0:00";

    this.normalizeHHMM(eq, "monthlyHours");

    eq.cumulativeHours = this.computeCumulativeHHMM(eq.prevHours, String(eq.monthlyHours));
    this.equipments.update(list => [...list]);
  }

  calculateFuelConsumption() {
    const fc = this.fuelConsumption;
    const harbor = Number.parseFloat(fc.consHarbor as string) || 0;
    const anchorage = Number.parseFloat(fc.consAnchorage as string) || 0;
    const sea = Number.parseFloat(fc.consSea as string) || 0;
    const totalCons = harbor + anchorage + sea;
    fc.totalCons = totalCons.toFixed(2);

    const bf = Number.parseFloat(fc.bfLastMonth as string) || 0;
    const rec = Number.parseFloat(fc.received as string) || 0;
    const defueled = Number.parseFloat(fc.defueled as string) || 0;
    const bal = (bf + rec) - defueled - totalCons;
    fc.balLeftOnboard = bal.toFixed(2);
  }

  calculateAvcatStatus() {
    const ac = this.avcatStatus;
    const givenToAc = Number.parseFloat(ac.givenToAc as string) || 0;
    const usedForTrials = Number.parseFloat(ac.usedForTrials as string) || 0;
    const totalCons = givenToAc + usedForTrials;
    ac.totalCons = totalCons.toFixed(2);

    const bf = Number.parseFloat(ac.bfLastMonth as string) || 0;
    const rec = Number.parseFloat(ac.received as string) || 0;
    const defueled = Number.parseFloat(ac.defueled as string) || 0;
    const bal = (bf + rec) - defueled - totalCons;
    ac.balLeftOnboard = bal.toFixed(2);
  }

  normalizeHHMM(obj: Record<string, FormItemValue>, prop: string) {
    const val = obj[prop];
    if (val && typeof val === "string") {
      const parts = val.includes(":") ? val.split(":") : [val, "0"];
      if (parts.length !== 2) return;

      let hrs = Number.parseInt(parts[0], 10) || 0;
      let mins = Number.parseInt(parts[1], 10) || 0;
      if (mins >= 60) {
        const extraHrs = Math.floor(mins / 60);
        mins = mins % 60;
        hrs += extraHrs;
      }

      const { maxHours, days, monthName, year } = this.getMaxHoursForSelectedMonth();
      if (hrs > maxHours) {
        this.appService.openAlert(
          "Validation Warning",
          `Entered hours (${hrs} hrs) exceed maximum allowed limit of ${maxHours} hours for ${monthName} ${year} (${days} days). Value reset to ${maxHours}:${String(mins).padStart(2, "0")}.`
        );
        hrs = maxHours;
      }

      obj[prop] = `${hrs}:${String(mins).padStart(2, "0")}`;
    }
  }

  isFipRhZero(val: string): boolean {
    if (!val) return false;
    return val === "0" || val === "00:00";
  }

  onFipRhChange(row: InjectorFipItem) {
    this.normalizeHHMM(row, "fipInMonth");
    const prevSI = row.prevRhSinceInstallation || "00:00";
    if (this.isFipRhZero(row.fipInMonth)) {
      row.rhSinceInstallation = prevSI;
      row.hrsBelow30 = "0";
      row.hrs30to50 = "0";
      row.hrs50to70 = "0";
      row.hrs70to100 = "0";
      row.lubOilConsCurrentMonth = "00:00";
      row.occasionsReplacement = "0";
      row.inOutWhichReplaced = "0";
      row.fuelConsumptionTons = "0";
      row.remarks = "";
    } else {
      row.rhSinceInstallation = this.addHHMMTime(prevSI, row.fipInMonth);
    }
    this.validateDieselLoadRegimeSum(row);
    this.syncFipRhToDgufTotals();
    this.validateDgufAndFipMatch();
  }

  // Sets each Injector FIP row's carry-forward baseline (R/H Since Installation as of
  // last month), matched onto this month's equipment-reconciled rows the same way
  // applyGasTurbineCarryForward()/applyReductionGearCarryForward() do (by eqpt_code,
  // falling back to eqpt_name) — leaves rows for equipment with no carry-forward
  // history (e.g. newly linked this month) starting from a zero baseline instead of
  // disappearing from the tab entirely.
  applyInjectorFipCarryForward(): void {
    for (const fip of this.injectorFipCalibration) {
      const prev = this.findCarryForwardByEquipment(
        this.carryForward.injector_fip, fip.eqptCode, fip.eqptName, fip.shipEquipmentId
      );
      const prevRh = String(prev?.running_hours_since_installation ?? "00:00");
      fip.rhSinceInstallation = prevRh;
      fip.prevRhSinceInstallation = prevRh;
    }
  }

  hhmmToMins(val: string): number {
    if (!val) return 0;
    if (!val.includes(":")) return (parseInt(val, 10) || 0) * 60;
    const parts = val.split(":");
    return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
  }

  minsToHHMM(mins: number): string {
    if (!mins || isNaN(mins) || mins < 0) return "00:00";
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}:${m.toString().padStart(2, "0")}`;
  }

  calculateGtgRh(row: GtgExploitationItem) {
    this.normalizeHHMM(row, "rhInHarbour");
    this.normalizeHHMM(row, "rhInSea");

    const harbourMins = this.hhmmToMins(row.rhInHarbour);
    const seaMins = this.hhmmToMins(row.rhInSea);
    const totalMonthMins = harbourMins + seaMins;

    row.totalRhInMonth = this.minsToHHMM(totalMonthMins);

    // SI is this GTG's own since-installation total: last filed return's figure plus the
    // hours it ran this month. It used to add Tab 1's hours-underway instead, which is
    // the *ship's* time at sea — unrelated to how long this generator ran, and reset every
    // month, so the running total never accumulated across returns.
    row.totalRhsi = this.addHHMMTime(row.prevTotalRhsi || "0:00", row.totalRhInMonth);
    this.onGtgCountInMonthChange(row);
  }

  onGtgCountInMonthChange(gtg: GtgExploitationItem): void {
    gtg.noOfColdStartsSi = Number(this.addNumericSi(gtg.prevColdStartsSi, gtg.noOfColdStarts));
    gtg.noOfHotStartsSi = Number(this.addNumericSi(gtg.prevHotStartsSi, gtg.noOfHotStarts));
    gtg.noOfBatteryColdStartsSi = Number(
      this.addNumericSi(gtg.prevBatteryColdStartsSi, gtg.noOfBatteryColdStarts)
    );
    gtg.noOfBatteryHotStartsSi = Number(
      this.addNumericSi(gtg.prevBatteryHotStartsSi, gtg.noOfBatteryHotStarts)
    );
  }

  // Single source of truth for the DGUF Sea/Harbour split:
  // (A) Total RH Sea = (B) Hours Underway + (C) Anchorage + (D) Drifting
  // (E) Hours in Harbour = max hours in the selected month − (C) Anchorage − (D) Drifting
  // Anchorage/Drifting are direct user entry in the Sea & Harbour table; Hours Underway
  // comes from Tab 1's running parameters; Total RH Sea and Hours in Harbour are computed.
  recalculateDgufSeaHarbourSplit(): void {
    this.dgufRunningHoursData.hrsUnderway = `${Number(this.runningParameters?.duringMonthHours || 0)}:${String(Number(this.runningParameters?.duringMonthMinutes || 0)).padStart(2, "0")}`;
    this.normalizeHHMM(this.dgufRunningHoursData, "hrsUnderway");
    this.normalizeHHMM(this.dgufRunningHoursData, "anchorage");
    this.normalizeHHMM(this.dgufRunningHoursData, "drifting");

    const { maxHours } = this.getMaxHoursForSelectedMonth();
    const maxMins = maxHours * 60;
    const underwayMins = this.hhmmToMins(this.dgufRunningHoursData.hrsUnderway);
    const anchorageMins = this.hhmmToMins(this.dgufRunningHoursData.anchorage);
    const driftingMins = this.hhmmToMins(this.dgufRunningHoursData.drifting);

    this.dgufRunningHoursData.totalRhSea = this.minsToHHMM(underwayMins + anchorageMins + driftingMins);

    const harbourMins = Math.max(0, maxMins - anchorageMins - driftingMins);
    this.dgufRunningHoursData.hrsInHarbour = this.minsToHHMM(harbourMins);

    if (this.hhmmToMins(this.dgufRunningHoursData.hrsShoreSupply) > harbourMins) {
      this.dgufRunningHoursData.hrsShoreSupply = this.dgufRunningHoursData.hrsInHarbour;
    }

    this.calculateActualDguf();
  }

  isDieselGeneratorFip(row: InjectorFipItem): boolean {
    const name = String(row.eqptName || "").toLowerCase();
    const nomenclature = String(row.nomenclature || "").toLowerCase();
    const code = String(row.eqptCode || "").toLowerCase();
    return name.includes("diesel generator") ||
      name.includes("diesel alternator") ||
      nomenclature.includes("diesel generator") ||
      nomenclature.includes("diesel alternator") ||
      code.startsWith("dg-") ||
      code.startsWith("da-");
  }

  // Each DGUF row's Total R/H in Month is the same reading as that equipment's Injector
  // FIP "R/H in Month" (Tab 7), so it is mirrored rather than typed twice.
  //
  // Match on shipEquipmentId — the underlying ShipEquipment id reconcileEquipmentRows
  // stamps on every row — NOT on eqptCode/eqptName. Both lists label Diesel Alternators
  // `DA-0${idx + 1}`, but the indexes come from different source lists: Injector FIP is
  // built from byCategory(["1", "2"]) (Main Engines *and* Diesel Alternators together)
  // while DGUF is built from byCategory(["2"]) alone. So on any ship that has main
  // engines, the same alternator is "DA-03" in the FIP table and "DA-01" in DGUF, the
  // code lookup misses, and the name fallback misses too whenever the equipment carries
  // no srar_txt/nomenclature/equipment_desc (both sides then fall back to
  // `Diesel Alternator No. ${idx + 1}`, again on different indexes) — silently zeroing
  // the DGUF Total R/H and tripping the "does not match Injector FIP" warning.
  syncFipRhToDgufTotals() {
    const fipByEquipmentId = new Map<number, InjectorFipItem>();
    for (const row of this.injectorFipCalibration) {
      if (typeof row.shipEquipmentId === "number") fipByEquipmentId.set(row.shipEquipmentId, row);
    }
    const fipByCode = new Map(this.injectorFipCalibration.map(row => [String(row.eqptCode || "").toLowerCase(), row]));
    const fipByName = new Map(this.injectorFipCalibration.map(row => [String(row.eqptName || "").toLowerCase(), row]));

    for (const dg of this.dgufGeneratorData) {
      const code = String(dg.eqptCode || dg.daNo || "").toLowerCase();
      const name = String(dg.eqptName || dg.daNo || "").toLowerCase();
      // Code/name lookups stay as a fallback for rows restored from an older saved
      // draft, which predate shipEquipmentId being stamped onto them.
      const fip = (typeof dg.shipEquipmentId === "number" ? fipByEquipmentId.get(dg.shipEquipmentId) : undefined)
        || fipByCode.get(code)
        || fipByName.get(name);
      dg.totalRhMonth = fip?.fipInMonth || "00:00";
    }
  }

  onDgufEquipmentRhChange() {
    this.recalculateDgufGeneratorTotals();
    this.validateDgufRowTotals();
    this.validateDgufAndFipMatch();
  }

  recalculateDgufGeneratorTotals() {
    for (const eq of this.dgufGeneratorData) {
      this.normalizeHHMM(eq, "rhSeaAnchorage");
      this.normalizeHHMM(eq, "rhHarbour");
    }
    this.syncFipRhToDgufTotals();
  }

  get dgufEquipmentTotals() {
    const totals = this.dgufGeneratorData.reduce(
      (acc, eq) => {
        acc.seaAnchorageMins += this.hhmmToMins(eq.rhSeaAnchorage);
        acc.harbourMins += this.hhmmToMins(eq.rhHarbour);
        acc.totalMonthMins += this.hhmmToMins(eq.totalRhMonth);
        return acc;
      },
      { seaAnchorageMins: 0, harbourMins: 0, totalMonthMins: 0 }
    );

    return {
      seaAnchorage: this.minsToHHMM(totals.seaAnchorageMins),
      harbour: this.minsToHHMM(totals.harbourMins),
      totalMonth: this.minsToHHMM(totals.totalMonthMins)
    };
  }

  // (E) Hours in Harbour is now computed from maxHoursInMonth − Anchorage − Drifting
  // (see recalculateDgufSeaHarbourSplit); this only validates Shore Supply against it.
  validateDgufShoreSupply() {
    this.normalizeHHMM(this.dgufRunningHoursData, "hrsShoreSupply");

    const harbourMins = this.hhmmToMins(this.dgufRunningHoursData.hrsInHarbour);
    const currentShoreMins = this.hhmmToMins(this.dgufRunningHoursData.hrsShoreSupply);
    if (currentShoreMins > harbourMins) {
      this.appService.openAlert("Error", "Hours shore supply cannot be more than Number of Hours in Harbour.");
      this.dgufRunningHoursData.hrsShoreSupply = this.dgufRunningHoursData.hrsInHarbour;
    }
  }

  calculateActualDguf() {
    const totalSeaMins = this.hhmmToMins(this.dgufRunningHoursData.totalRhSea);
    let sumEquipSeaMins = 0;
    let sumEquipHarbourMins = 0;

    for (const eq of this.dgufGeneratorData) {
      sumEquipSeaMins += this.hhmmToMins(eq.rhSeaAnchorage);
      sumEquipHarbourMins += this.hhmmToMins(eq.rhHarbour);
    }

    if (totalSeaMins > 0) {
      this.dgufLimitingValues.actualDgufSea = (sumEquipSeaMins / totalSeaMins).toFixed(2);
    } else {
      this.dgufLimitingValues.actualDgufSea = "0.00";
    }

    const totalHarbourMins = this.hhmmToMins(this.dgufRunningHoursData.hrsInHarbour);
    if (totalHarbourMins > 0) {
      this.dgufLimitingValues.actualDgufHarbour = (sumEquipHarbourMins / totalHarbourMins).toFixed(2);
    } else {
      this.dgufLimitingValues.actualDgufHarbour = "0.00";
    }

  }

  validateDgufAndFipMatch() {
    if (this.activeSubTab() !== 8) return;

    this.recalculateDgufGeneratorTotals();
    let sumDgufMins = 0;
    for (const eq of this.dgufGeneratorData) {
      if (eq.totalRhMonth) sumDgufMins += this.hhmmToMins(eq.totalRhMonth);
    }

    let sumFipMins = 0;
    for (const fip of this.injectorFipCalibration) {
      if (this.isDieselGeneratorFip(fip) && fip.fipInMonth) {
        sumFipMins += this.hhmmToMins(fip.fipInMonth);
      }
    }

    if (sumDgufMins > 0 || sumFipMins > 0) {
      if (sumDgufMins !== sumFipMins) {
        this.appService.openAlert("Warning", "Total R/H in Month for DGUF does not match the Total R/H in Month for Injector FIP Calibration.");
      }
    }
  }

  validateDgufRowTotals() {
    if (this.activeSubTab() !== 8) return;

    const mismatchedRows = this.dgufGeneratorData.filter((eq) => {
      const expectedMins = this.hhmmToMins(eq.rhSeaAnchorage) + this.hhmmToMins(eq.rhHarbour);
      return this.hhmmToMins(eq.totalRhMonth) !== expectedMins;
    });

    if (mismatchedRows.length > 0) {
      const names = mismatchedRows.map(eq => eq.daNo || eq.eqptName).join(", ");
      this.appService.openAlert(
        "Warning",
        `DGUF Total RH Month must match RH Sea / Anchorage + RH Harbour for: ${names}.`
      );
    }
  }

  get calculatedEEF(): number {
    const hours = this.parseHHMMToHours(this.eefData.hoursUnderway);
    if (hours > 0) {
      return parseFloat((180.45 / hours).toFixed(2));
    }
    return 0.00;
  }

  parseHHMMToHours(value: string): number {
    if (!value) return 0;
    const parts = value.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    return h + (m / 60);
  }

  updateDisabledRanges() {
    this.activityDisabledRanges = this.activities.map(a => {
      const parts = a.dateRange.split(" to ");
      return {
        from: parts[0] || "",
        to: parts[1] || ""
      };
    });
  }

  isDateOverlap(fromDateStr: string, toDateStr: string): boolean {
    if (!fromDateStr || !toDateStr) return false;
    const newFrom = new Date(fromDateStr).getTime();
    const newTo = new Date(toDateStr).getTime();

    for (const act of this.activities) {
      if (!act["dateRange"]) continue;
      const parts = String(act["dateRange"]).split(" to ");
      if (parts.length < 2) continue;
      const existingFrom = new Date(parts[0]).getTime();
      const existingTo = new Date(parts[1]).getTime();

      if (newFrom <= existingTo && newTo >= existingFrom) {
        return true;
      }
    }
    return false;
  }

  addActivity() {
    if (this.activityFromDate && this.activityToDate && this.shipState && this.shipLocation && this.activityType && this.activityDetail) {
      if (new Date(this.activityFromDate) > new Date(this.activityToDate)) {
        this.appService.openAlert("Warning", "From Date cannot be after To Date.");
        return;
      }

      if (this.isDateOverlap(this.activityFromDate, this.activityToDate)) {
        this.appService.openAlert("Warning", "The selected date range overlaps with an already added activity in this month. Please choose a different date range.");
        return;
      }

      this.activities.push({
        dateRange: `${this.activityFromDate} to ${this.activityToDate}`,
        shipState: this.shipState,
        shipLocation: this.shipLocation,
        activityType: this.activityType,
        activityDetail: this.activityDetail,
        remarks: this.activityRemarks || "N/A"
      });
      this.activityFromDate = "";
      this.activityToDate = "";
      this.shipState = "";
      this.shipLocation = "";
      this.activityType = "";
      this.activityDetail = "";
      this.activityRemarks = "";
      this.updateDisabledRanges();
    } else {
      this.appService.openAlert("Warning", "Please fill in all mandatory fields for the ship activity.");
    }
  }

  deleteActivity(index: number) {
    this.activities.splice(index, 1);
    this.updateDisabledRanges();
  }

  // --- Modal Logic ---
  toggleAddEquipmentModal(show: boolean) {
    this.showAddEquipmentModal = show;
    if (show) {
      this.newEquipmentType = {
        selectEquipment: "",
        systemEquipment: "",
        date: "",
        qty: "",
        reason: "",
        remarks: ""
      };
    }
  }

  toggleAddRoutineModal(show: boolean) {
    this.showAddRoutineModal = show;
    if (show) {
      this.newRoutine = {
        equipment: "",
        routineName: "",
        description: "",
        date: "",
        undertakenBy: ""
      };
    }
  }

  toggleAddMajorAssemblyModal(show: boolean) {
    this.showAddMajorAssemblyModal = show;
    if (show) {
      this.newMajorAssembly = {
        equipment: "",
        date: "",
        unit: "",
        reason: "",
        remarks: ""
      };
    }
  }

  saveEquipmentType() {
    if (this.newEquipmentType.selectEquipment && this.newEquipmentType.systemEquipment) {
      this.replacementMajorAssemblies.push({
        eqptName: this.newEquipmentType.selectEquipment,
        eqptSrNumber: "DA-" + getRandom4DigitNumber(),
        dateOfReplacement: this.newEquipmentType.date || "2026-06-01",
        subAssemblyUnitName: this.newEquipmentType.systemEquipment,
        reasonOfReplacement: this.newEquipmentType.reason || "Routine",
        lifeSinceInstallation: this.newEquipmentType.qty || "12",
        lastCalibratedOn: "2025-01-12",
        nextCalibration: "2026-01-12",
        remarks: this.newEquipmentType.remarks || ""
      });
      this.toggleAddEquipmentModal(false);
    }
  }

  saveRoutine() {
    if (this.newRoutine.equipment && this.newRoutine.routineName) {
      let prefix = "ME-";
      if (this.activeSubTab() === 10) {
        prefix = "GT-";
      } else if (this.activeSubTab() === 11) {
        prefix = "GTG-";
      }

      const routineItem = {
        eqptName: this.newRoutine.equipment,
        eqptSrNumber: prefix + getRandom4DigitNumber(),
        date: this.newRoutine.date || "2026-06-01",
        descriptionForRoutine: `${this.newRoutine.routineName} - ${this.newRoutine.description || ""}`,
        undertakenByWhom: this.newRoutine.undertakenBy || "Ship Staff"
      };

      if (this.activeSubTab() === 10) {
        this.gtRoutinesUndertaken.push(routineItem);
      } else if (this.activeSubTab() === 11) {
        this.gtgRoutinesUndertaken.push(routineItem);
      } else {
        this.routinesUndertaken.push(routineItem);
      }
      this.toggleAddRoutineModal(false);
    }
  }

  deleteRoutine(index: number) {
    if (this.activeSubTab() === 10) {
      this.gtRoutinesUndertaken.splice(index, 1);
    } else if (this.activeSubTab() === 11) {
      this.gtgRoutinesUndertaken.splice(index, 1);
    } else {
      this.routinesUndertaken.splice(index, 1);
    }
  }

  saveMajorAssembly() {
    if (this.newMajorAssembly.equipment) {
      const prefix = this.activeSubTab() === 10 ? "GT-" : "GTG-";
      const item = {
        eqptName: this.newMajorAssembly.equipment,
        eqptSrNumber: prefix + getRandom4DigitNumber(),
        dateOfReplacement: this.newMajorAssembly.date || "2026-06-01",
        subAssemblyUnitName: this.newMajorAssembly.unit || "N/A",
        reasonOfReplacement: this.newMajorAssembly.reason || "Routine",
        lifeSinceInstallation: "12",
        remarks: this.newMajorAssembly.remarks || ""
      };

      if (this.activeSubTab() === 10) {
        this.gtReplacementMajorAssemblies.push(item);
      } else if (this.activeSubTab() === 11) {
        this.gtgReplacementMajorAssemblies.push(item);
      }
      this.toggleAddMajorAssemblyModal(false);
    }
  }

  deleteMajorAssembly(index: number) {
    if (this.activeSubTab() === 10) {
      this.gtReplacementMajorAssemblies.splice(index, 1);
    } else if (this.activeSubTab() === 11) {
      this.gtgReplacementMajorAssemblies.splice(index, 1);
    } else {
      this.replacementMajorAssemblies.splice(index, 1);
    }
  }

  showAddLubricantModal = signal(false);
  newLubricant: { lubricantId: string; name: string; quantity: number; unit: string } = {
    lubricantId: "", name: "", quantity: 0, unit: ""
  };

  addLubricant() {
    this.newLubricant = { lubricantId: "", name: "", quantity: 0, unit: "" };
    this.showAddLubricantModal.set(true);
  }

  closeAddLubricantModal() {
    this.showAddLubricantModal.set(false);
  }

  onCmmsLubricantSelected(lubricantId: string) {
    this.newLubricant.lubricantId = lubricantId;
    const match = this.cmmsLubricants.find(l => l.value === lubricantId);
    if (match) {
      this.newLubricant.name = match.name;
      this.newLubricant.unit = match.unit || "";
    }
  }

  confirmAddLubricant() {
    if (!this.newLubricant.name) {
      this.appService.openAlert("Validation", "Please select a lubricant.");
      return;
    }
    this.lubricantData.push({
      name: this.newLubricant.name,
      quantity: Math.trunc(this.newLubricant.quantity) || 0,
      unit: this.newLubricant.unit
    });
    this.showAddLubricantModal.set(false);
  }

  // Deleting a lubricant row asks first. It was a single click with no undo, next to the
  // row's own inputs, so a mis-click silently dropped a consumption figure that had
  // already been entered. Same confirm-then-act shape the SFD management screen uses.
  deleteLubricantIndex = signal<number | null>(null);

  get lubricantPendingDelete(): LubItem | null {
    const index = this.deleteLubricantIndex();
    return index === null ? null : this.lubricantData[index] ?? null;
  }

  deleteLubricant(index: number) {
    this.deleteLubricantIndex.set(index);
  }

  cancelDeleteLubricant(): void {
    this.deleteLubricantIndex.set(null);
  }

  confirmDeleteLubricant(): void {
    const index = this.deleteLubricantIndex();
    if (index !== null && index >= 0 && index < this.lubricantData.length) {
      this.lubricantData.splice(index, 1);
    }
    this.deleteLubricantIndex.set(null);
  }

  // Whether the ship was underway at all this month (Hours Underway in Step 1 / Running
  // Parameters is non-zero). When it wasn't, the ship stayed alongside all month and the
  // operational tabs (fuel, DGUF, etc.) have nothing meaningful to report, so they're not
  // enforced as mandatory. When it was, those tabs are required before final submission.
  isShipUnderwayThisMonth(): boolean {
    const hrs = Number.parseInt(String(this.runningParameters.duringMonthHours || 0), 10) || 0;
    const mins = Number.parseInt(String(this.runningParameters.duringMonthMinutes || 0), 10) || 0;
    return hrs > 0 || mins > 0;
  }

  private validateStep1Error(): string | null {
    if (!this.isShipUnderwayThisMonth()) {
      return null;
    }

    const dist = Number.parseFloat(String(this.runningParameters.duringMonthDistance || 0)) || 0;
    const speed = Number.parseFloat(String(this.runningParameters.maxSpeedDuringMonth || 0)) || 0;
    const durHrs = Number.parseInt(String(this.runningParameters.maxSpeedDurationHours || 0), 10) || 0;
    const durMins = Number.parseInt(String(this.runningParameters.maxSpeedDurationMinutes || 0), 10) || 0;
    const speedDate = String(this.runningParameters.maxSpeedDate || "").trim();
    const shaftRpm = String(this.runningParameters.maxShaftRpm || "").trim();

    if (dist <= 0) return "Distance Run is mandatory when Hours Underway is non-zero.";
    if (speed <= 0) return "Max Speed is mandatory when Hours Underway is non-zero.";
    if (durHrs <= 0 && durMins <= 0) return "Max Speed Duration is mandatory when Hours Underway is non-zero.";
    if (!speedDate) return "Max Speed Date is mandatory when Hours Underway is non-zero.";
    if (!shaftRpm) return "Max Shaft RPM is mandatory when Hours Underway is non-zero.";

    return null;
  }

  private validateStep6Error(): string | null {
    for (const kit of this.lubOilCoolantTestKits) {
      // Only a kit the ship has declared operational owes calibration dates. An
      // undeclared ("") status means the ship holds no such kit / has nothing to
      // report, and a Non-Ops or Not Held kit has its date fields cleared and
      // disabled — none of those may block submission.
      if (kit.opsNonOps !== "Ops") continue;
      if (!kit.calibrationDate || !kit.nextCalibrationDueDate) {
        return `Last Calibration Date and Next Calibration Due are mandatory for "${kit.description}" when marked Ops.`;
      }
      if (kit.nextCalibrationDueDate <= kit.calibrationDate) {
        return `Next Calibration Due for "${kit.description}" must be after the Last Calibration Date.`;
      }
    }
    for (const pur of this.lubOilFuelCentrifuge) {
      if (pur.opsNonOps !== "Ops") continue;
      if (!pur.lastCalibratedOn || !pur.nextCalibration) {
        return `Last Calibrated Date and Next Calibration Due are mandatory for "${pur.eqptName}" when marked Ops.`;
      }
      if (pur.nextCalibration <= pur.lastCalibratedOn) {
        return `Next Calibration Due for "${pur.eqptName}" must be after the Last Calibrated Date.`;
      }
    }
    return null;
  }

  // Step 2's two tables (Boiler Steaming, Feedwater Alkalinity) are read-only rosters
  // driven entirely by the ship's boiler equipment — there is no "Add" button, so a ship
  // that carries no auxiliary boiler equipment has no way to put a row in them. Demanding
  // that the step be "filled" on such a ship was therefore an unsatisfiable rule that
  // permanently blocked "Submit to CO". No boilers means nothing to report; when boilers
  // *are* present, the monthly steaming hours each row exists to capture are still owed.
  private validateStep2Error(): string | null {
    if (!this.isShipUnderwayThisMonth()) {
      return null;
    }
    if (!this.boilerSteamingData?.length) {
      return null;
    }
    for (const boiler of this.boilerSteamingData) {
      if (!String(boiler.hrsSteamedDuringMonth || "").trim()) {
        return `Hrs Steamed During Month is mandatory for "${boiler.eqptName}" when Hours Underway is non-zero.`;
      }
    }
    return null;
  }

  private validateStep7Error(): string | null {
    for (const fip of this.injectorFipCalibration) {
      if (this.hhmmToMins(fip.fipInMonth) <= 0) continue;
      // Remarks is deliberately not in this set: it is free commentary, and there is
      // nothing to say on most rows, so requiring it blocked submission over a field
      // that carries no return data.
      const missing = !fip.hrsBelow30 || !fip.hrs30to50 || !fip.hrs50to70 || !fip.hrs70to100 ||
        !fip.lubOilConsCurrentMonth || !fip.dateOfInjectorCalibration || !fip.occasionsReplacement ||
        !fip.inOutWhichReplaced || !fip.fuelConsumptionTons;
      if (missing) {
        return `Every field except Remarks in Injector FIP Calibration/Replacement is mandatory for "${fip.eqptName}" since R/H in Month is greater than 0.`;
      }
    }
    return null;
  }

  /**
   * Applies an "On Routine" pick to an R/H Extension row.
   *
   * Both halves are stored: `onRoutineId` is the master.Frequency pk that
   * RHExtension.on_routine points at, and `onRoutine` is its label, which is what the
   * report summary, the PDF export and the CMMS payload's on_routine_text carry. Keeping
   * the label in step here means neither view has to resolve the id back to a name.
   */
  onRoutineSelected(rh: RhExtensionItem, frequencyId: number | string | null): void {
    const id = frequencyId === null || frequencyId === "" ? null : Number(frequencyId);
    rh.onRoutineId = id;
    const match = id === null
      ? undefined
      : this.routineHourOptions.find(option => option.id === id);
    rh.onRoutine = match ? match.label : "";
  }

  private validateStep13Error(): string | null {
    for (const rh of this.mainEngineRHExtensions) {
      if (!rh.rhDuringTrial || !rh.trialConductedBy || !rh.rhExtensionGranted || !rh.rhLeftExpiry) {
        return `All fields are mandatory for "${rh.eqptName}" in Main Engine R/H Extension Log.`;
      }
    }
    for (const rh of this.dieselAlternatorRHExtensions) {
      if (!rh.onRoutine || !rh.rhDuringTrial || !rh.trialConductedBy || !rh.authorityLetterRef ||
        !rh.rhExtensionGranted || !rh.rhLeftExpiry) {
        return `All fields are mandatory for "${rh.eqptName}" in Diesel Alternator R/H Extension.`;
      }
    }
    return null;
  }

  // Tab 14 — the Engineer Officer's own two entries. Both are the EO's judgement on the
  // month, not derived figures, so a return cannot be filed without them: the EEF reason
  // explains a factor outside the ship-class limit, and the remark is the EO's statement
  // that the CO signs off against.
  private validateStep14Error(): string | null {
    if (!String(this.eefData.reasonExceeding || "").trim()) {
      return "Reason For Exceeding EEF is mandatory.";
    }
    if (!String(this.eefData.shipRemarks || "").trim()) {
      return "Engineer Officer Remarks is mandatory.";
    }
    return null;
  }

  getStepValidationError(step: number): string | null {
    if (step === 1) return this.validateStep1Error();
    if (step === 2) return this.validateStep2Error();
    if (step === 6) return this.validateStep6Error();
    if (step === 7) return this.validateStep7Error();
    if (step === 13) return this.validateStep13Error();
    if (step === 14) return this.validateStep14Error();

    const underway = this.isShipUnderwayThisMonth();
    if (!underway) {
      return null;
    }

    if (step === 3 && (!this.activities || this.activities.length === 0)) {
      return "At least 1 Ship Activity entry must be added when Hours Underway is non-zero.";
    }
    if (step === 4 && (!this.fuelConsumption.bfLastMonth || !this.fuelConsumption.received || !this.fuelConsumption.totalCons || !this.fuelConsumption.balLeftOnboard)) {
      return "All mandatory Fuel Consumption fields must be filled when Hours Underway is non-zero.";
    }
    // Step 8 (DGUF) carries no rule: its generator table is populated from the ship's
    // Diesel Alternator equipment and has no "Add" button, so the rule that used to live
    // here only ever fired on a ship with no Diesel Alternators linked — and the only way
    // out of it was to type a non-zero "Total R/H at Sea", i.e. invent running hours for
    // generators the ship doesn't have. Where alternators *are* linked the roster is
    // filled from the master and the old rule passed regardless, so nothing is lost.
    return null;
  }

  isStepValid(step: number): boolean {
    return this.getStepValidationError(step) === null;
  }

  findExistingRecordForSelection(): SrarRecord | undefined {
    const selectedMonthNo = this.getMonthNumber(this.selectedMonth());
    const selectedYearNo = Number(this.selectedYear());
    return this.records().find((record) => (
      this.getMonthNumber(record.month) === selectedMonthNo &&
      Number(record.year) === selectedYearNo
    ));
  }

  findPreviousMonthRecordForSelection(): SrarRecord | undefined {
    const previous = this.getPreviousMonthYear();
    return this.records().find((record) => (
      this.getMonthNumber(record.month) === previous.month &&
      Number(record.year) === previous.year
    ));
  }

  getPreviousMonthYear(): { month: number; year: number } {
    let month = this.getMonthNumber(this.selectedMonth()) - 1;
    let year = Number(this.selectedYear());
    if (month < 1) {
      month = 12;
      year -= 1;
    }
    return { month, year };
  }

  // --- Backend DTO Mapping & Load / Save API Logic ---
  mapOpsToBackend(val: StringNullable): number | null {
    if (!val) return null;
    const lower = val.toLowerCase().trim();
    if (lower === "ops" || lower === "op" || lower === "1") return 1;
    if (lower === "non ops" || lower === "non op" || lower === "non-ops" || lower === "non-op" || lower === "2") return 2;
    if (lower === "not held" || lower === "not-held" || lower === "3") return 3;
    return 1;
  }

  mapOpsToFrontend(val: OpsValue): string {
    if (val == null) return "Ops";
    const num = Number(val);
    if (num === 1) return "Ops";
    if (num === 2) return "Non-Ops";
    if (num === 3) return "Not Held";
    return "Ops";
  }

  mapConductedByToBackend(val: StringNullable): number {
    const v = (val || "").trim().toUpperCase();
    if (v === "TRIAL TEAM") return 1;
    if (v === "SHIP STAFF" || v === "SS") return 2;
    if (v === "DTTT") return 3;
    if (v === "MTU") return 4;
    if (v === "CTT") return 5;
    if (v === "GTTT") return 6;
    if (v === "CATT") return 7;
    if (v === "CBIU") return 8;
    if (v === "OEM") return 9;
    if (v === "MSETT") return 10;
    return 2;
  }

  mapConductedByToFrontend(val: OpsValue): string {
    if (val == null) return "Ship Staff";
    const num = Number(val);
    if (num === 1) return "Trial Team";
    if (num === 2) return "Ship Staff";
    if (num === 3) return "DTTT";
    if (num === 4) return "MTU";
    if (num === 5) return "CTT";
    if (num === 6) return "GTTT";
    if (num === 7) return "CATT";
    if (num === 8) return "CBIU";
    if (num === 9) return "OEM";
    if (num === 10) return "MSETT";
    return "Ship Staff";
  }

  mapStatusToBackend(val: string | null | undefined): number {
    const v = (val || "").toUpperCase().trim();
    if (v === "SAT" || v === "OPS" || v === "SATISFACTORY") return 1;
    return 2;
  }

  mapStatusToFrontend(val: number | string | null | undefined): string {
    if (val == null) return "SAT";
    const num = Number(val);
    return num === 1 ? "SAT" : "Unsat";
  }

  formatDateToYYYYMMDD(dateStr: string | null | undefined): string | null {
    if (!dateStr || typeof dateStr !== "string") return null;
    const normalized = dateStr.trim().replace(/[\s/]+/g, "-");
    const parts = normalized.split("-");
    if (parts.length !== 3) return null;
    if (parts[0].length === 4) return dateStr;
    const day = parseInt(parts[0], 10);
    let month = 0;
    let year = parseInt(parts[2], 10);
    if (year < 100) year += 2000;
    const monthPart = parts[1].toLowerCase();
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const monthIndex = months.findIndex((m) => monthPart.startsWith(m));
    if (monthIndex !== -1) month = monthIndex + 1;
    else month = parseInt(parts[1], 10);
    if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // Backend SAT/Unsat choice fields (STP.effluent_status, Magazine.status) serialize as
  // their stored integer (1/2), not the display label — normalize back to "SAT"/"UNSAT"
  // for the dropdowns, while still accepting an already-textual value.
  satUnsatChoiceToLabel(value: unknown): string {
    const str = String(value ?? "").trim().toLowerCase();
    if (str === "1" || str === "sat" || str === "satisfactory") return "SAT";
    if (str === "2" || str === "unsat" || str === "unsatisfactory") return "UNSAT";
    return "SAT";
  }

  /**
   * Restores the tabs whose saved values are plain fields rather than
   * equipment-derived rows: Ship Activity, Fuel, AVCAT, Test Kits, DGUF running
   * hours/limits, Lubricants and EEF.
   *
   * These were saved by constructCompositePayload but never read back, so opening a
   * report showed whatever happened to be in memory — the component's own seed values
   * on a fresh load, or the previously-opened report's data — and the next save wrote
   * that straight over the real figures. Every field is assigned unconditionally,
   * including when the saved list is empty: "this report has no ship activities" has
   * to clear the table, not leave the last one's rows sitting there.
   */
  private loadSavedSimpleTabs(data: Record<string, unknown> | undefined): void {
    const rowsOf = (key: string): Record<string, unknown>[] => {
      const value = data?.[key];
      return Array.isArray(value) ? value as Record<string, unknown>[] : [];
    };
    const objectOf = (key: string): Record<string, unknown> | null => {
      const value = data?.[key];
      return value && typeof value === "object" && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
    };
    const str = (value: unknown, fallback = ""): string =>
      value === null || value === undefined ? fallback : String(value);

    // Tab 3 — Ship Activity. The serializer resolves the FK columns back to their
    // names on read (SrarMonthlyShipActivitySerializer.to_representation), so these
    // drop straight into the string-valued dropdowns.
    this.activities = rowsOf("tab_3_ship_activities").map(row => {
      const from = str(row["from_date"]);
      const to = str(row["to_date"]);
      return {
        id: typeof row["id"] === "number" ? row["id"] as number : undefined,
        dateRange: from && to ? `${from} to ${to}` : from || to,
        shipState: str(row["ship_state"]),
        shipLocation: str(row["ship_location"]),
        activityType: str(row["ship_activity_type"]),
        activityDetail: str(row["ship_activity_detail"]),
        remarks: str(row["remarks"])
      };
    });

    // Tab 4 — Fuel. Saved as a single-element list (see constructCompositePayload).
    const fuel = rowsOf("tab_4_fuel_consumptions")[0] ?? null;
    this.fuelConsumption = {
      bfLastMonth: str(fuel?.["b_f_from_last_month"], "0"),
      received: str(fuel?.["recieved"], "0"),
      consHarbor: str(fuel?.["consumed_in_harbour"], "0"),
      consAnchorage: str(fuel?.["consumed_at_anchorage"], "0"),
      consSea: str(fuel?.["consumed_at_sea"], "0"),
      totalCons: str(fuel?.["total_consumed"], "0"),
      defueled: str(fuel?.["defueled"], "0"),
      balLeftOnboard: str(fuel?.["balance_left_on_board"], "0")
    };

    const avcat = objectOf("tab_4_avcat_status");
    this.avcatStatus = {
      bfLastMonth: str(avcat?.["b_f_from_last_month"], "0"),
      received: str(avcat?.["recieved"], "0"),
      givenToAc: str(avcat?.["given_to_ac"], "0"),
      usedForTrials: str(avcat?.["used_for_trials_drained"], "0"),
      totalCons: str(avcat?.["total_consumed"], "0"),
      defueled: str(avcat?.["defuelded"], "0"),
      balLeftOnboard: str(avcat?.["balance_left_on_board"], "0")
    };
    // Keeps the derived totals consistent with the restored inputs.
    this.calculateFuelConsumption();
    this.calculateAvcatStatus();

    // Tab 6 — Test Kits. The two kits are a fixed roster, so saved values are matched
    // onto the existing rows by description rather than replacing the list.
    const savedKits = new Map(
      rowsOf("tab_6_test_kits").map(row => [str(row["description"]).trim().toLowerCase(), row])
    );
    this.lubOilCoolantTestKits = this.lubOilCoolantTestKits.map(kit => {
      const saved = savedKits.get(String(kit.description).trim().toLowerCase());
      if (!saved) return { ...kit, opsNonOps: "", calibrationDate: "", nextCalibrationDueDate: "" };
      const savedOps = saved["ops_or_non_ops"];
      return {
        ...kit,
        // Blank must round-trip as blank. mapOpsToFrontend() answers "Ops" for a null
        // status (the right default for the equipment-master-backed tables), which here
        // would turn an undeclared kit back into an operational one on every reload and
        // re-block submission — so an unset status is kept unset.
        opsNonOps: savedOps == null || savedOps === "" ? "" : this.mapOpsToFrontend(savedOps as OpsValue),
        calibrationDate: str(saved["calibration"]),
        nextCalibrationDueDate: str(saved["next_calibration_due_date"])
      };
    });

    // Tab 8 — DGUF running hours & limits. hrsUnderway is recomputed from the header
    // by updateSinceComm(), so it is deliberately not restored here.
    const dgufRh = objectOf("tab_8_dguf_running_hours");
    this.dgufRunningHoursData = {
      totalRhSea: str(dgufRh?.["total_rh_at_sea"], "00:00"),
      hrsUnderway: str(dgufRh?.["hours_underway"], "00:00"),
      anchorage: str(dgufRh?.["anchorage"], "00:00"),
      drifting: str(dgufRh?.["drifting"], "00:00"),
      hrsInHarbour: str(dgufRh?.["no_of_hours_in_harbour"], "00:00"),
      hrsShoreSupply: str(dgufRh?.["hours_shore_supply_avl_when_alongs"], "00:00"),
      coldMoves: Number(dgufRh?.["no_of_cold_moves_in_harbour"] ?? 0) || 0,
      comments: str(dgufRh?.["cmts_wrt_to_non_avl_shore_supply"])
    };

    const limits = rowsOf("tab_8_dguf_limits")[0] ?? null;
    this.dgufLimitingValues = {
      limitingValueSea: str(limits?.["limiting_value_sea"]),
      actualDgufSea: str(limits?.["actual_dguf_sea"]),
      reasonExceedingSea: str(limits?.["exceed_reason_sea"]),
      limitingValueHarbour: str(limits?.["limiting_value_harbour"]),
      actualDgufHarbour: str(limits?.["actual_dguf_harbour"]),
      reasonExceedingHarbour: str(limits?.["exceed_reason_harbour"])
    };

    // Tab 12 — Lubricants.
    this.lubricantData = rowsOf("tab_12_lubricants").map(row => ({
      name: str(row["name"]),
      quantity: Number(row["quantity"] ?? 0) || 0,
      unit: str(row["unit"])
    }));

    // Tab 14 — EEF. `designed` is a ship-class spec pulled from CMMS by
    // loadEefDesignedValue(), not a per-report entry, so it is left alone here.
    const eef = objectOf("tab_14_eef");
    this.eefData.reasonExceeding = str(eef?.["reason_for_exceeding"]);
    this.eefData.shipRemarks = str(eef?.["ship_remarks"]);
  }

  loadReportDetails(id: number) {
    this.srarService.getReportDetails(id).subscribe({
      // eslint-disable-next-line sonarjs/cognitive-complexity
      next: (data) => {
        if (data && data["header"]) {
          const h = data["header"] as Record<string, unknown>;
          // Whatever route got us here, the loaded report is now the one on screen —
          // so it, not the selector's previous value, defines the period. Without
          // this a report opened for one month could be saved back under another,
          // since constructCompositePayload() takes srar_month/srar_year from the
          // selector.
          this.applySelectedPeriod(
            h["srar_month"] as string | number | undefined,
            h["srar_year"] as string | number | undefined
          );
          this.currentReportSentToCo.set(Boolean(h["send_to_co"]));
          this.currentReportCoApproved.set(Boolean(h["co_approved"]));
          this.currentReportCmmsSynced.set(Boolean(h["cmms_sync_status"]));
          this.coApprovalChecked.set(Boolean(h["co_approved"]));
          const duringHrs = parseInt(String(h["hours_underway_month_hr"] || 0), 10) || 0;
          const duringMins = parseInt(String(h["hours_underway_month_min"] || 0), 10) || 0;
          this.runningParameters = {
            baselineSinceCommHours: 0,
            baselineSinceCommMinutes: 0,
            baselineSinceCommDistance: 0,
            duringMonthHours: duringHrs,
            duringMonthMinutes: duringMins,
            duringMonthDistance: String(h["distance_run_month"] || ""),
            sinceCommHours: "",
            sinceCommDistance: "",
            maxSpeedDuringMonth: String(h["max_speed"] || ""),
            maxSpeedDurationHours: (h["max_duration_hr"] as number) || 0,
            maxSpeedDurationMinutes: (h["max_duration_min"] as number) || 0,
            maxSpeedDate: (h["max_speed_date"] as string) || "",
            maxShaftRpm: String(h["max_shaft_rpm"] || "")
          };
          this.seedSinceCommBaselineForExistingReport(h);
        }
        const tab1Rows = data?.["tab_1_equipment_exploitations"] as Record<string, unknown>[] | undefined;
        this.savedEquipmentHoursByShipEquipmentId = new Map(
          (Array.isArray(tab1Rows) ? tab1Rows : [])
            .filter(row => typeof row["sfd_details"] === "number")
            .map(row => [row["sfd_details"] as number, row])
        );
        this.loadSavedSimpleTabs(data);
        // Tab 2 — Boiler Steaming. Saved on every Save but, until now, never read
        // back: reopening a report showed an empty boiler table.
        const boilerRows = data?.["tab_2_boiler_data"] as Record<string, unknown>[] | undefined;
        const existingBoiler = (row: Record<string, unknown>): BoilerSteamingItem | undefined =>
          this.boilerSteamingData.find(b => b.eqptName === String(row["name"] || ""));
        if (Array.isArray(boilerRows) && boilerRows.length > 0) {
          this.boilerSteamingData = boilerRows.map(row => ({
            id: typeof row["id"] === "number" ? row["id"] as number : undefined,
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            hrsSteamedDuringMonth: String(row["hrs_steamed_in_month"] || ""),
            hrsSteamedSinceComm: String(row["hrs_steamed_since_commissioning"] || ""),
            hrsAbove80: String(row["hrs_above_20_percent"] || ""),
            // Restored from their own columns now that the save payload carries them.
            // The claim that used to sit here — "SrarMonthlyBoiler has no columns for
            // them" — was wrong: the model has had last_retubing_date,
            // hrs_steamed_since/at_last_retubing, due_date_for_next_inspection and
            // life_assessed_in_months all along; nothing was writing them.
            lastRetubingDate: String(row["last_retubing_date"] || ""),
            hrsSteamedSinceLastRetubing: String(row["hrs_steamed_since_last_retubing"] || ""),
            hrsSteamedAtLastRetubing: String(row["hrs_steamed_at_last_retubing"] || ""),
            nextInspectionDate: String(row["due_date_for_next_inspection"] || ""),
            lifeAssessedMonths: String(row["life_assessed_in_months"] || ""),
            // Still not persisted: SrarMonthlyBoiler has last_int_clg_date /
            // last_ext_clg_date (and matching hours pairs) plus
            // date_of_last_durability_test, and which of those the screen's "Last Est
            // OLG"/"Last Hydraulic Test" cells belong in is a call for whoever owns the
            // form. Keeping what is on screen rather than blanking it.
            lastEstOlgDate: String(existingBoiler(row)?.["lastEstOlgDate"] ?? ""),
            hrsSteamedSinceLastOlg: String(existingBoiler(row)?.["hrsSteamedSinceLastOlg"] ?? ""),
            hrsSteamedAtLastOlg: String(existingBoiler(row)?.["hrsSteamedAtLastOlg"] ?? ""),
            lastEstOlgDate2: String(existingBoiler(row)?.["lastEstOlgDate2"] ?? ""),
            hrsSteamedSinceLastOlg2: String(existingBoiler(row)?.["hrsSteamedSinceLastOlg2"] ?? ""),
            hrsSteamedAtLastOlg2: String(existingBoiler(row)?.["hrsSteamedAtLastOlg2"] ?? ""),
            lastHydraulicTestDate: String(existingBoiler(row)?.["lastHydraulicTestDate"] ?? "")
          }));
        }

        // Tab 2, second table — Feedwater Alkalinity. Had no restore at all, matching the
        // fact that it had no save payload either.
        const alkalinityRows = data?.["tab_2_boiler_alkalinity"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(alkalinityRows) && alkalinityRows.length > 0) {
          const existingAlk = (row: Record<string, unknown>): BoilerAlkalinityItem | undefined =>
            this.alkalinityData.find(a => a.eqptName === String(row["eqpt_name"] || ""));
          this.alkalinityData = alkalinityRows.map(row => {
            const kept = existingAlk(row);
            return {
              ...(kept ?? {} as BoilerAlkalinityItem),
              id: typeof row["id"] === "number" ? row["id"] as number : undefined,
              shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
              eqptName: String(row["eqpt_name"] || ""),
              nomenclature: String(row["nomenclature"] || ""),
              locOnBoard: String(row["loc_on_board"] || ""),
              serNo: String(row["serial_no"] || ""),
              salinityLastWeek: String(row["salinity_last_week"] || ""),
              chlorideDuringMonth: String(row["chloride_during_month"] || ""),
              alkalinityN: String(row["alkalinity_n"] || ""),
              alkPpm: String(row["alk_ppm"] || "")
            } as BoilerAlkalinityItem;
          });
        }

        // Tab 7 — Status of Safety Device Checks. Same gap as the boiler table.
        const sdcRows = data?.["tab_7_safety_device_checks"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(sdcRows) && sdcRows.length > 0) {
          this.safetyDeviceChecks = sdcRows.map(row => ({
            id: typeof row["id"] === "number" ? row["id"] as number : undefined,
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptSerNo: String(row["serial_no"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            sdcConductedBy: String(row["sdc_conducted_by"] || ""),
            dateOfSdc: String(row["date_of_sdc"] || ""),
            sfcGmsKWh: String(row["sfc_in_gm_kwh"] ?? ""),
            lastSfcTrialDate: String(row["last_sfc_trial_date"] || ""),
            displacementDuringSfc: String(row["displacement_during_sfc_trial"] ?? ""),
            status: String(row["status"] || "SAT")
          }));
        }

        // Tab 7 — Injector / FIP Calibration. Same gap again.
        const fipRows = data?.["tab_7_calibrations"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(fipRows) && fipRows.length > 0) {
          this.injectorFipCalibration = fipRows.map(row => ({
            id: typeof row["id"] === "number" ? row["id"] as number : undefined,
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            fipInMonth: String(row["running_hours_months"] || "0:00"),
            rhSinceInstallation: String(row["running_hours_since_installation"] || "0:00"),
            prevRhSinceInstallation: this.baselineHHMM(
              String(row["running_hours_since_installation"] || "0:00"),
              String(row["running_hours_months"] || "0:00")
            ),
            hrsBelow30: String(row["hrs_run_below_33_percent"] || "0"),
            hrs30to50: String(row["hrs_run_33_to_50_percent"] || "0"),
            hrs50to70: String(row["hrs_run_50_to_70_percent"] || "0"),
            hrs70to100: String(row["hrs_run_70_to_100_percent"] || "0"),
            lubOilConsCurrentMonth: String(row["lub_oil_consumption_in_month"] || "0:00"),
            dateOfInjectorCalibration: String(row["date_of_inj_fip_calibration"] || ""),
            occasionsReplacement: String(row["occasion"] || "0"),
            inOutWhichReplaced: String(row["rh_at_which_replaced"] || ""),
            fuelConsumptionTons: String(row["fuel_consumption_in_month"] || "0"),
            remarks: String(row["remarks"] || "")
          }));
        }

        const torsionRows = data?.["tab_4_torsion_meters"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(torsionRows) && torsionRows.length > 0) {
          this.torsionMeterData = torsionRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            nomenclature: String(row["nomenclature"] || `TM-0${index + 1}`),
            eqptCode: String(row["eqpt_code"] || `TM-0${index + 1}`),
            locOnBoard: String(row["loc_on_board"] || ""),
            opsNonOps: this.mapOpsToFrontend(row["ops_or_non_ops"] as OpsValue),
            torsionMeterRdg: String(row["torsion_meter_rdg"] || "0.0"),
            maxRpmAchieved: String(row["max_rpm_achieved"] || "0"),
            nonOpsSince: String(row["non_ops_since"] || ""),
            lastCalibrationOn: String(row["last_calibration_date"] || ""),
            nextCalibrationDue: String(row["next_calibration_date"] || "")
          }));
        }
        const iccpRows = data?.["tab_5_iccp"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(iccpRows) && iccpRows.length > 0) {
          this.iccpData = iccpRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            nomenclature: String(row["nomenclature"] || `ICCP-0${index + 1}`),
            eqptCode: String(row["serial_no"] || `ICCP-0${index + 1}`),
            locOnBoard: String(row["loc_on_board"] || ""),
            opsNonOps: this.mapOpsToFrontend(row["ops_or_non_ops"] as OpsValue),
            nonOpsSince: String(row["non_ops_since"] || "")
          }));
        }
        const h2sRows = data?.["tab_5_h2s"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(h2sRows) && h2sRows.length > 0) {
          this.h2sSensorData = h2sRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            nomenclature: String(row["nomenclature"] || `H2S-0${index + 1}`),
            eqptCode: String(row["serial_no"] || `H2S-0${index + 1}`),
            locOnBoard: String(row["loc_on_board"] || ""),
            opsNonOps: this.mapOpsToFrontend(row["ops_or_non_ops"] as OpsValue),
            nonOpsSince: String(row["non_ops_since"] || ""),
            lastCalibratedOn: String(row["last_calibration_date"] || ""),
            nextCalibration: String(row["next_calibration_date"] || "")
          }));
        }
        const stpRows = data?.["tab_5_stp"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(stpRows) && stpRows.length > 0) {
          this.stpData = stpRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            nomenclature: String(row["nomenclature"] || `STP-0${index + 1}`),
            eqptCode: String(row["eqpt_code"] || `STP-0${index + 1}`),
            locOnBoard: String(row["loc_on_board"] || ""),
            status: this.satUnsatChoiceToLabel(row["effluent_status"]),
            effluentTestDate: String(row["effluent_test_date"] || ""),
            remarks: String(row["remarks"] || "")
          }));
        }
        const magazineRows = data?.["tab_5_magazine"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(magazineRows) && magazineRows.length > 0) {
          this.mffsData = magazineRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            nomenclature: String(row["nomenclature"] || `MFFS-0${index + 1}`),
            eqptCode: String(row["eqpt_code"] || `MFFS-0${index + 1}`),
            locOnBoard: String(row["loc_on_board"] || ""),
            status: this.satUnsatChoiceToLabel(row["status"]),
            lastTrialsTaken: String(row["last_trials_taken"] || ""),
            nextTrialsDue: String(row["next_trials_due"] || "")
          }));
        }
        const centrifugeRows = data?.["tab_6_centrifuges"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(centrifugeRows) && centrifugeRows.length > 0) {
          this.lubOilFuelCentrifuge = centrifugeRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || row["nomenclature"] || `Purifier-0${index + 1}`),
            nomenclature: String(row["nomenclature"] || row["eqpt_name"] || `Purifier-0${index + 1}`),
            eqptCode: String(row["eqpt_code"] || `PUR-0${index + 1}`),
            serNo: String(row["serial_no"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            opsNonOps: this.mapOpsToFrontend(row["ops_or_non_ops"] as OpsValue),
            nonOpsSince: String(row["non_ops_since"] || ""),
            // Were hardcoded to "" here, which wiped the saved calibration dates off the
            // screen on every reload — and since saveReportPayload() reloads the report
            // after each save, they vanished the moment the user pressed Save.
            lastCalibratedOn: String(row["last_calibrated_on"] || ""),
            nextCalibration: String(row["next_calibration"] || "")
          }));
        }
        const fptRows = data?.["tab_9_fpt_me"] as Record<string, unknown>[] | undefined;
        const fpt = Array.isArray(fptRows) ? fptRows[0] : undefined;
        if (fpt) {
          this.fptMainEngineGeneral = {
            lastFptDate: String(fpt["date"] || ""),
            displacement: String(fpt["displacement"] || ""),
            maxSpeed: String(fpt["max_speed"] || ""),
            occasionReason: String(fpt["occasion_reason"] || ""),
            draughtFwd: String(fpt["draught_fwd"] || ""),
            draughtAft: String(fpt["draught_aft"] || ""),
            conductedBy: String(fpt["conducted_by"] || ""),
            torsionMotorReading: String(fpt["torsion_meter_reading"] || ""),
            seaState: String(fpt["sea_state"] || ""),
            remarks: String(fpt["pending_dr_activities_reason"] || "")
          };
        }
        const fptEquipmentRows = data?.["tab_9_fpt_eq"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(fptEquipmentRows) && fptEquipmentRows.length > 0) {
          this.fptMainEngineSpecific = fptEquipmentRows.map((row) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            fuelRackDbl: String(row["fuel_rack_dbr_max"] || ""),
            fciThrottleMarking: String(row["marking_max"] || ""),
            lastEhmTrialsDate: String(row["undertaken_on"] || ""),
            pitch: String(row["pitch"] || ""),
            maxRpm: String(row["max_rpm"] || ""),
            ratedPower: String(row["rated_power"] || ""),
            maxAchievedPower: String(row["max_achieved_power"] || ""),
            remarks: String(row["remarks"] || "")
          }));
        }
        const fptDaRows = data?.["tab_9_fpt_da"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(fptDaRows) && fptDaRows.length > 0) {
          this.fptDieselGeneratorLoad = fptDaRows.map((row) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            location: String(row["loc_on_board"] || ""),
            eqptSerNo: String(row["serial_no"] || ""),
            date: String(row["date"] || ""),
            occasionReason: String(row["occasion"] || ""),
            ratedLoad: String(row["rated_load"] || ""),
            maxLoadAchieved: String(row["max_load_achieved"] || ""),
            conductedBy: String(row["conducted_by"] || ""),
            lastEhmTrialsDate: String(row["last_ehm_trials_undertaken_on"] || ""),
            remarks: String(row["remarks"] || "")
          }));
        }
        const dgufRows = data?.["tab_8_dguf"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(dgufRows) && dgufRows.length > 0) {
          this.dgufGeneratorData = dgufRows.map((row, index) => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            srNo: index + 1,
            eqptSerNo: String(row["eqptSerNo"] || ""),
            eqptCode: String(row["serial_no"] || row["eqptCode"] || ""),
            eqptName: String(row["eqptName"] || row["equipment_name"] || `Diesel Generator No. ${index + 1}`),
            locOnBoard: String(row["locOnBoard"] || row["location"] || ""),
            daNo: String(row["da_number"] || row["daNo"] || `DA-${index + 1}`),
            rhSeaAnchorage: String(row["rh_at_sea_and_anchorage"] || "00:00"),
            rhHarbour: String(row["rh_at_port"] || "00:00"),
            totalRhMonth: String(row["total_rh_in_month"] || "00:00")
          }));
        }
        const dgufRh = data?.["tab_8_dguf_running_hours"] as Record<string, unknown> | null | undefined;
        if (dgufRh) {
          this.dgufRunningHoursData = {
            totalRhSea: String(dgufRh["total_rh_at_sea"] || "00:00"),
            hrsUnderway: String(dgufRh["hours_underway"] || "00:00"),
            anchorage: String(dgufRh["anchorage"] || "00:00"),
            drifting: String(dgufRh["drifting"] || "00:00"),
            hrsInHarbour: String(dgufRh["no_of_hours_in_harbour"] || "00:00"),
            hrsShoreSupply: String(dgufRh["hours_shore_supply_avl_when_alongs"] || "00:00"),
            coldMoves: Number(dgufRh["no_of_cold_moves_in_harbour"] || 0),
            comments: String(dgufRh["cmts_wrt_to_non_avl_shore_supply"] || "")
          };
        }
        const gtRows = data?.["tab_10_gas_turbine"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtRows) && gtRows.length > 0) {
          this.gasTurbineExploitation = gtRows.map(row => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            totalRhInMonth: String(row["total_rh_in_month"] || ""),
            totalRhSi: String(row["total_rh_si"] || ""),
            rhRegime1InMonth: String(row["rh_regime_1_in_mth"] || ""),
            rhRegime1Si: String(row["rh_regime_1_si"] || ""),
            rhRegime2InMonth: String(row["rh_regime_2_in_mth"] || ""),
            rhRegime2Si: String(row["rh_regime_2_si"] || ""),
            rhRegime3InMonth: String(row["rh_regime_3_in_mth"] || ""),
            rhRegime3Si: String(row["rh_regime_3_si"] || ""),
            prevTotalRhSi: this.baselineHHMM(
              String(row["total_rh_si"] || ""), String(row["total_rh_in_month"] || "")
            ),
            prevRhRegime1Si: this.baselineHHMM(
              String(row["rh_regime_1_si"] || ""), String(row["rh_regime_1_in_mth"] || "")
            ),
            prevRhRegime2Si: this.baselineHHMM(
              String(row["rh_regime_2_si"] || ""), String(row["rh_regime_2_in_mth"] || "")
            ),
            prevRhRegime3Si: this.baselineHHMM(
              String(row["rh_regime_3_si"] || ""), String(row["rh_regime_3_in_mth"] || "")
            ),
            noOfOccasion: String(row["no_of_cold_starts_in_month"] || ""),
            noOfRepOrders: String(row["no_of_cold_starts_si"] || ""),
            unscheduledEngagement: String(row["no_of_hot_starts_in_month"] || ""),
            fuelExploitation: String(row["no_of_hot_starts_si"] || ""),
            gslChemQty: String(row["no_of_false_starts_in_month"] || ""),
            status: String(row["no_of_false_starts_si"] || ""),
            rhEngine1: String(row["no_of_tech_starts_in_month"] || ""),
            rhEngine2: String(row["no_of_tech_starts_si"] || ""),
            lastCalibrationDate: String(row["no_of_astern_engagements_in_mth"] || ""),
            lastEhmTrialDate: String(row["no_of_astern_engagements_count"] || ""),
            lastFptDate: String(row["no_of_stop_orders_in_mth"] || ""),
            noOfStopOrdersSi: String(row["no_of_stop_orders_si"] ?? ""),
            // Same reversible baseline the R/H columns above restore, for the counts:
            // without it the first edit to an "In Mth" count would recompute its SI as
            // 0 + this month and wipe the since-installation total.
            prevColdStartsSi: this.baselineNumeric(
              row["no_of_cold_starts_si"], row["no_of_cold_starts_in_month"]
            ),
            prevHotStartsSi: this.baselineNumeric(
              row["no_of_hot_starts_si"], row["no_of_hot_starts_in_month"]
            ),
            prevFalseStartsSi: this.baselineNumeric(
              row["no_of_false_starts_si"], row["no_of_false_starts_in_month"]
            ),
            prevTechStartsSi: this.baselineNumeric(
              row["no_of_tech_starts_si"], row["no_of_tech_starts_in_month"]
            ),
            prevAsternEngagementsSi: this.baselineNumeric(
              row["no_of_astern_engagements_count"], row["no_of_astern_engagements_in_mth"]
            ),
            prevStopOrdersSi: this.baselineNumeric(
              row["no_of_stop_orders_si"], row["no_of_stop_orders_in_mth"]
            ),
            lastChemClg: String(row["last_chem_clg"] || ""),
            nonOpsSince: "",
            gslEngine1_1_0to1_25: "",
            gslEngine2_1_0to1_25: ""
          }));
        }
        const dieselRgRows = data?.["tab_7_diesel_reduction_gear"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(dieselRgRows) && dieselRgRows.length > 0) {
          this.dieselReductionGear = dieselRgRows.map(row => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            hrsForMonth: String(row["hrs_for_month"] || ""),
            hrsSinceInstallation: String(row["hrs_since_installation"] || ""),
            prevHrsSinceInstallation: this.baselineHHMM(
              String(row["hrs_since_installation"] || ""),
              String(row["hrs_for_month"] || "")
            )
          }));
        }
        const rgRows = data?.["tab_10_reduction_gear"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(rgRows) && rgRows.length > 0) {
          this.gtReductionGear = rgRows.map(row => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            eqptSerNo: String(row["serial_no"] || ""),
            totalRhInMonth: String(row["total_rh_in_month"] || ""),
            totalRhsi: String(row["total_rh_si"] || ""),
            hoRegimeBelow0_25: String(row["total_rh_regime1_in_month"] || ""),
            hoRegimeBelow0_25Si: String(row["total_rh_regime1_si"] || ""),
            hoRegime0_25to0_5: String(row["total_rh_regime2_in_month"] || ""),
            hoRegime0_25to0_5Si: String(row["total_rh_regime2_si"] || ""),
            hoRegime0_5to0_75: String(row["total_rh_regime3_in_month"] || ""),
            hoRegime0_5to0_75Si: String(row["total_rh_regime3_si"] || ""),
            prevTotalRhsi: this.baselineHHMM(
              String(row["total_rh_si"] || ""), String(row["total_rh_in_month"] || "")
            ),
            prevHoRegimeBelow0_25Si: this.baselineHHMM(
              String(row["total_rh_regime1_si"] || ""),
              String(row["total_rh_regime1_in_month"] || "")
            ),
            prevHoRegime0_25to0_5Si: this.baselineHHMM(
              String(row["total_rh_regime2_si"] || ""),
              String(row["total_rh_regime2_in_month"] || "")
            ),
            prevHoRegime0_5to0_75Si: this.baselineHHMM(
              String(row["total_rh_regime3_si"] || ""),
              String(row["total_rh_regime3_in_month"] || "")
            ),
            slidingHours0_25: String(row["trailing_rh_in_month"] || ""),
            slidingHours0_25Si: String(row["trailing_rh_si"] || ""),
            serviceLife: String(row["service_life_in_month"] || ""),
            serviceLifeSi: String(row["service_life_si"] || ""),
            routineRegime1: String(row["no_of_eng_regime1_in_month"] || ""),
            routineRegime1Si: String(row["no_of_eng_regime1_si"] || ""),
            routineRegime2: String(row["no_of_eng_regime2_in_month"] || ""),
            routineRegime2Si: String(row["no_of_eng_regime2_si"] || ""),
            routineRegime3: String(row["no_of_eng_regime3_in_month"] || ""),
            routineRegime3Si: String(row["no_of_eng_regime3_si"] || ""),
            routineRegime4: String(row["no_of_eng_regime4_in_month"] || ""),
            routineRegime4Si: String(row["no_of_eng_regime4_si"] || ""),
            prevSlidingHours0_25Si: this.baselineHHMM(
              String(row["trailing_rh_si"] || ""), String(row["trailing_rh_in_month"] || "")
            ),
            prevServiceLifeSi: this.baselineHHMM(
              String(row["service_life_si"] || ""), String(row["service_life_in_month"] || "")
            ),
            prevRoutineRegime1Si: this.baselineNumeric(
              row["no_of_eng_regime1_si"], row["no_of_eng_regime1_in_month"]
            ),
            prevRoutineRegime2Si: this.baselineNumeric(
              row["no_of_eng_regime2_si"], row["no_of_eng_regime2_in_month"]
            ),
            prevRoutineRegime3Si: this.baselineNumeric(
              row["no_of_eng_regime3_si"], row["no_of_eng_regime3_in_month"]
            ),
            prevRoutineRegime4Si: this.baselineNumeric(
              row["no_of_eng_regime4_si"], row["no_of_eng_regime4_in_month"]
            )
          }));
        }
        const gtRepRows = data?.["tab_10_replacements"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtRepRows)) {
          this.gtReplacementMajorAssemblies = gtRepRows.map(row => ({
            eqptName: String(row["eqpt_name"] || ""),
            eqptSrNumber: String(row["eqpt_sr_number"] || row["serial_no"] || ""),
            dateOfReplacement: String(row["date_of_replacement"] || ""),
            subAssemblyUnitName: String(row["unit_sub_units"] || ""),
            reasonOfReplacement: String(row["reason_for_replacement"] || ""),
            lifeSinceInstallation: "",
            remarks: String(row["replacement_remarks"] || "")
          }));
        }
        const gtRoutineRows = data?.["tab_10_srmr"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtRoutineRows)) {
          this.gtRoutinesUndertaken = gtRoutineRows.map(row => ({
            eqptName: String(row["eqpt_name"] || ""),
            eqptSrNumber: String(row["eqpt_sr_number"] || row["serial_no"] || ""),
            date: String(row["date"] || ""),
            descriptionForRoutine: String(row["description_of_routine"] || ""),
            undertakenByWhom: String(row["undertaken_by_whom"] || "")
          }));
        }
        const gtgRows = data?.["tab_11_gtg"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtgRows) && gtgRows.length > 0) {
          this.gtgExploitationData = gtgRows.map(row => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            rhInSea: String(row["total_rh_in_sea"] || ""),
            rhInHarbour: String(row["total_rh_in_harbour"] || ""),
            totalRhInMonth: String(row["total_rh_in_month"] || ""),
            totalRhsi: String(row["total_rh_si"] || ""),
            noOfColdStarts: Number(row["no_of_cold_starts_in_month"] || 0),
            noOfColdStartsSi: Number(row["no_of_cold_starts_si"] || 0),
            noOfHotStarts: Number(row["no_of_hot_starts_in_month"] || 0),
            noOfHotStartsSi: Number(row["no_of_hot_starts_si"] || 0),
            noOfBatteryColdStarts: Number(row["no_of_battery_cold_starts_in_month"] || 0),
            noOfBatteryColdStartsSi: Number(row["no_of_battery_cold_starts_si"] || 0),
            noOfBatteryHotStarts: Number(row["no_of_battery_hot_starts_in_month"] || 0),
            noOfBatteryHotStartsSi: Number(row["no_of_battery_hot_starts_si"] || 0),
            // Reversible baselines, as on the GT tables: stored SI minus the month it
            // already includes, so reopening and editing a saved return recomputes the
            // same running totals instead of restarting them from this month.
            prevTotalRhsi: this.baselineHHMM(
              String(row["total_rh_si"] || ""), String(row["total_rh_in_month"] || "")
            ),
            prevColdStartsSi: this.baselineNumeric(
              row["no_of_cold_starts_si"], row["no_of_cold_starts_in_month"]
            ),
            prevHotStartsSi: this.baselineNumeric(
              row["no_of_hot_starts_si"], row["no_of_hot_starts_in_month"]
            ),
            prevBatteryColdStartsSi: this.baselineNumeric(
              row["no_of_battery_cold_starts_si"], row["no_of_battery_cold_starts_in_month"]
            ),
            prevBatteryHotStartsSi: this.baselineNumeric(
              row["no_of_battery_hot_starts_si"], row["no_of_battery_hot_starts_in_month"]
            ),
            lastChemClgDateReason: String(row["date"] || "")
          }));
        }
        const gtgRgRows = data?.["tab_11_gtg_rg"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtgRgRows) && gtgRgRows.length > 0) {
          this.gtgReductionGear = gtgRgRows.map(row => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            eqptCode: String(row["eqpt_code"] || ""),
            locOnBoard: String(row["loc_on_board"] || ""),
            serNo: String(row["serial_no"] || ""),
            rgRunningHours: String(row["rg_running_hours"] || ""),
            noOfHotStarts: Number(row["no_of_hot_starts"] || 0),
            noOfColdStarts: Number(row["no_of_cold_starts"] || 0),
            rhInHarbour: String(row["rh_in_harbour"] || ""),
            rhInSea: String(row["rh_in_sea"] || ""),
            inMonthsSi: String(row["in_months_si"] || ""),
            prevInMonthsSi: this.baselineNumeric(
              row["in_months_si"], row["rg_running_hours"]
            )
          }));
        }
        const gtgRepRows = data?.["tab_11_gtg_rep"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtgRepRows)) {
          this.gtgReplacementMajorAssemblies = gtgRepRows.map(row => ({
            eqptName: String(row["eqpt_name"] || ""),
            eqptSrNumber: String(row["eqpt_sr_number"] || row["serial_no"] || ""),
            dateOfReplacement: String(row["date"] || ""),
            subAssemblyUnitName: String(row["unit_sub_units"] || ""),
            reasonOfReplacement: String(row["reason_for_replacement"] || ""),
            lifeSinceInstallation: "",
            remarks: String(row["replacement_remarks"] || "")
          }));
        }
        const gtgRoutineRows = data?.["tab_11_gtg_srmr"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(gtgRoutineRows)) {
          this.gtgRoutinesUndertaken = gtgRoutineRows.map(row => ({
            eqptName: String(row["eqpt_name"] || ""),
            eqptSrNumber: String(row["eqpt_sr_number"] || row["serial_no"] || ""),
            date: String(row["date"] || ""),
            descriptionForRoutine: String(row["description_of_routine"] || ""),
            undertakenByWhom: String(row["undertaken_by_whom"] || "")
          }));
        }
        const rhRows = data?.["tab_13_rh_extensions"] as Record<string, unknown>[] | undefined;
        if (Array.isArray(rhRows) && rhRows.length > 0) {
          const mapRh = (row: Record<string, unknown>): RhExtensionItem => ({
            shipEquipmentId: typeof row["sfd_details"] === "number" ? row["sfd_details"] as number : undefined,
            eqptName: String(row["eqpt_name"] || ""),
            location: String(row["loc_on_board"] || ""),
            nomenclature: String(row["nomenclature"] || ""),
            serNo: String(row["serial_no"] || ""),
            onRoutine: String(row["on_routine_text"] || ""),
            onRoutineId: typeof row["on_routine"] === "number" ? row["on_routine"] as number : null,
            rhDuringTrial: String(row["rh_ext_at_conduct_of_ext_trial"] || ""),
            trialConductedBy: String(row["trial_conducted_by"] || ""),
            authorityLetter: null,
            authorityLetterRef: String(row["authority_letter_for_extension_trial"] || ""),
            rhdi: String(row["total_rh_in_month"] || ""),
            rhExtensionGranted: String(row["rh_extension_granted_upto"] || ""),
            rhLeftExpiry: String(row["rh_left_for_expiry_of_extension"] || "")
          });
          this.mainEngineRHExtensions = rhRows.filter(row => Number(row["equipment_type"] || 1) === 1).map(mapRh);
          this.dieselAlternatorRHExtensions = rhRows.filter(row => Number(row["equipment_type"] || 1) === 2).map(mapRh);
          this.loadEquipmentRoutineOptions();
        }
        this.recalculateDgufSeaHarbourSplit();

        // Reconcile every equipment-driven tab (including Tab 1, via the
        // savedEquipmentHoursByShipEquipmentId stash above) against whatever is
        // currently linked in SRAR Masters, so equipment added/removed there since
        // this report was last saved shows up immediately here too.
        this.loadMasterEquipmentsFromBackend();
        this.loadRunningHoursEquipment();
      },
      error: (err) => console.error("Failed to load report details:", err)
    });
  }

  getMonthNumber(month: string | number | undefined): number {
    if (typeof month === "number") return month;
    const parsed = parseInt(String(month), 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) return parsed;
    const monthNames = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
    const shortNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mStr = String(month || "").toLowerCase().trim();
    let idx = monthNames.indexOf(mStr);
    if (idx === -1) idx = shortNames.indexOf(mStr.slice(0, 3));
    return idx !== -1 ? idx + 1 : (new Date().getMonth() + 1);
  }

  constructCompositePayload(isFinalSubmission = false): Record<string, unknown> {
    const [sinceCommHr, sinceCommMin] = String(this.runningParameters.sinceCommHours || "0:00").split(":");
    return {
      header: {
        id: this.srarId,
        // No `ship` key. It used to be a hardcoded null, and since the backend keys a
        // monthly return on (ship, month, year), that null made the "does this period
        // already exist" lookup run as ship IS NULL — which never matched the real rows
        // — so every save inserted another header for the same month instead of
        // updating the one before it. The backend now resolves the deployment's own
        // ship (master.utils.get_this_ship, the same resolution the CMMS push uses);
        // sending a null from here would only put that back.
        srar_month: this.getMonthNumber(this.selectedMonth()),
        srar_year: parseInt(String(this.selectedYear()), 10) || 2026,
        hours_underway_month_hr: parseInt(String(this.runningParameters.duringMonthHours || 0), 10) || 0,
        hours_underway_month_min: parseInt(String(this.runningParameters.duringMonthMinutes || 0), 10) || 0,
        distance_run_month: parseFloat(String(this.runningParameters.duringMonthDistance || 0)) || 0,
        // Running ship-life totals as of this month — baseline (carried forward from last
        // month) plus this month's own figures, see updateSinceComm(). Persisting these lets
        // next month's carry-forward and this KPI keep accruing instead of resetting.
        hours_underway_since_commissioning_hr: parseInt(sinceCommHr, 10) || 0,
        hours_underway_since_commissioning_min: parseInt(sinceCommMin, 10) || 0,
        distance_run_since_commissioning: parseFloat(String(this.runningParameters.sinceCommDistance || 0)) || 0,
        max_speed: parseFloat(String(this.runningParameters.maxSpeedDuringMonth || 0)) || 0,
        max_shaft_rpm: parseFloat(String(this.runningParameters.maxShaftRpm || 0)) || 0,
        max_speed_date: this.formatDateToYYYYMMDD(this.runningParameters.maxSpeedDate),
        max_speed_duration_hr: parseInt(String(this.runningParameters.maxSpeedDurationHours || 0), 10) || 0,
        max_speed_duration_min: parseInt(String(this.runningParameters.maxSpeedDurationMinutes || 0), 10) || 0,
        is_saved: false,
        // Workflow flags are only ever *advanced* here, never reset. The header
        // serializer saves partial=True, so leaving these out of a draft save keeps
        // whatever the backend already holds. Sending `send_to_co: false` and
        // `co_approved: false` on every save meant a plain Save on an approved return
        // silently pushed it back to Draft — and a CO who saved anything while
        // reviewing knocked out the very "sent to CO" flag their Approve needs.
        // Approval itself is never claimed from this form; it goes through
        // report/finalize/ with action "approve".
        ...(isFinalSubmission ? { send_to_co: this.eoDetails.sendToCo || false } : {}),
        eo_name: this.eoDetails.name,
        eo_rank: this.eoDetails.rank,
        eo_personal_no: this.eoDetails.personalNo,
        eo_contact_no: this.eoDetails.contactNo,
        eo_writer_contact_no: this.eoDetails.writerContactNo,
      },
      tab_1_equipment_exploitations: this.equipments().map(e => {
        // The Hrs For Month cell binds to `monthlyHours` ("H:MM"). This used to read
        // duringMonthHours/duringMonthMinutes instead — numeric fields that belong to
        // runningParameters and that an equipment row never carries — so every
        // equipment saved 0 hours on every save, no matter what was typed.
        const monthMinutes = typeof e.duringMonthHours === "number"
          ? (e.duringMonthHours * 60)
          + (typeof e.duringMonthMinutes === "number" ? e.duringMonthMinutes : 0)
          : this.parseTimeToMinutes(e.monthlyHours);
        const item: Record<string, unknown> = {
          nomenclature: e.name || "",
          sfd_details: typeof e.shipEquipmentId === "number" ? e.shipEquipmentId : null,
          rhsi_till_current_month: typeof e.prevHours === "number"
            ? Math.floor(e.prevHours)
            : (parseInt(String(e.prevHours || "0").split(":")[0], 10) || 0),
          hrs_for_month_hrs: Math.floor(monthMinutes / 60),
          hrs_for_month_min: monthMinutes % 60
        };
        if (this.srarId && typeof e.srarExploitationId === "number") {
          item["id"] = e.srarExploitationId;
        }
        return item;
      }),
      tab_2_boiler_data: this.boilerSteamingData.map(b => ({
        ...(this.srarId && b.id ? { id: b.id } : {}),
        // Both Step 2 tables are rebuilt by reconcileEquipmentRows() after every save
        // (loadReportDetails ends by refreshing the equipment roster), and that keeps an
        // existing row only when it carries shipEquipmentId. Without sfd_details going
        // out and coming back, every restored row had shipEquipmentId undefined, so the
        // reconcile replaced it with a blank default — the values vanished the instant
        // the report reloaded, which is on every save.
        sfd_details: typeof b.shipEquipmentId === "number" ? b.shipEquipmentId : null,
        name: b.eqptName,
        nomenclature: b.nomenclature,
        loc_on_board: b.locOnBoard,
        serial_no: b.serNo,
        hrs_steamed_in_month: b.hrsSteamedDuringMonth,
        hrs_steamed_since_commissioning: b.hrsSteamedSinceComm,
        hrs_above_20_percent: b.hrsAbove80,
        // Columns that exist on SrarMonthlyBoiler and are editable on screen, but were
        // missing from this payload — so they were typed and thrown away. The OLG and
        // hydraulic-test columns are deliberately still absent: SrarMonthlyBoiler offers
        // several similarly-named columns for those (internal vs external cleaning,
        // durability test) and picking the wrong one would file a reading under the wrong
        // heading, which is worse than not storing it. Pending confirmation.
        last_retubing_date: this.formatDateToYYYYMMDD(b.lastRetubingDate),
        hrs_steamed_since_last_retubing: b.hrsSteamedSinceLastRetubing,
        hrs_steamed_at_last_retubing: b.hrsSteamedAtLastRetubing,
        due_date_for_next_inspection: this.formatDateToYYYYMMDD(b.nextInspectionDate),
        life_assessed_in_months: b.lifeAssessedMonths
      })),
      // Step 2's second table. It had no key in this payload at all, so all eleven of its
      // editable cells were discarded on every save even though
      // SrarBoilerAlkalinitySalinityDetail has columns for them and the backend already
      // syncs a "tab_2_boiler_alkalinity" relation. Only the columns whose meaning maps
      // 1:1 to the on-screen label are sent; the pH/TDS/phosphate/alkalinity-% cells have
      // per-boiler-make variants (ph vs y150_ph, tds_ppm vs y164_tds_ppm, vkd_*) that need
      // confirming before a value is written to one of them.
      tab_2_boiler_alkalinity: this.alkalinityData.map(a => ({
        ...(this.srarId && a.id ? { id: a.id } : {}),
        // Same reconcile round-trip as tab_2_boiler_data above.
        sfd_details: typeof a.shipEquipmentId === "number" ? a.shipEquipmentId : null,
        eqpt_name: a.eqptName,
        nomenclature: a.nomenclature,
        loc_on_board: a.locOnBoard,
        serial_no: a.serNo,
        salinity_last_week: a.salinityLastWeek,
        chloride_during_month: a.chlorideDuringMonth,
        alkalinity_n: a.alkalinityN,
        alk_ppm: a.alkPpm
      })),
      tab_3_ship_activities: this.activities.map(a => {
        const parts = a.dateRange ? String(a.dateRange).split(" to ") : ["", ""];
        return {
          from_date: parts[0] ? this.formatDateToYYYYMMDD(parts[0]) : null,
          to_date: parts[1] ? this.formatDateToYYYYMMDD(parts[1]) : null,
          ship_state: a.shipState,
          ship_location: a.shipLocation,
          ship_activity_type: a.activityType,
          ship_activity_detail: a.activityDetail,
          remarks: a.remarks
        };
      }),
      tab_4_fuel_consumptions: [{
        b_f_from_last_month: parseFloat(String(this.fuelConsumption.bfLastMonth || 0)) || 0,
        recieved: parseFloat(String(this.fuelConsumption.received || 0)) || 0,
        consumed_in_harbour: parseFloat(String(this.fuelConsumption.consHarbor || 0)) || 0,
        consumed_at_anchorage: parseFloat(String(this.fuelConsumption.consAnchorage || 0)) || 0,
        consumed_at_sea: parseFloat(String(this.fuelConsumption.consSea || 0)) || 0,
        total_consumed: parseFloat(String(this.fuelConsumption.totalCons || 0)) || 0,
        defueled: parseFloat(String(this.fuelConsumption.defueled || 0)) || 0,
        balance_left_on_board: parseFloat(String(this.fuelConsumption.balLeftOnboard || 0)) || 0
      }],
      tab_4_avcat_status: {
        b_f_from_last_month: parseFloat(String(this.avcatStatus.bfLastMonth || 0)) || 0,
        recieved: parseFloat(String(this.avcatStatus.received || 0)) || 0,
        given_to_ac: parseFloat(String(this.avcatStatus.givenToAc || 0)) || 0,
        used_for_trials_drained: parseFloat(String(this.avcatStatus.usedForTrials || 0)) || 0,
        total_consumed: parseFloat(String(this.avcatStatus.totalCons || 0)) || 0,
        defuelded: parseFloat(String(this.avcatStatus.defueled || 0)) || 0,
        balance_left_on_board: parseFloat(String(this.avcatStatus.balLeftOnboard || 0)) || 0
      },
      tab_4_torsion_meters: this.torsionMeterData.map(tm => ({
        sfd_details: typeof tm.shipEquipmentId === "number" ? tm.shipEquipmentId : null,
        nomenclature: tm.nomenclature,
        eqpt_code: tm.eqptCode,
        loc_on_board: tm.locOnBoard,
        ops_or_non_ops: this.mapOpsToBackend(tm.opsNonOps),
        torsion_meter_rdg: tm.torsionMeterRdg,
        max_rpm_achieved: tm.maxRpmAchieved,
        non_ops_since: this.formatDateToYYYYMMDD(tm.nonOpsSince),
        last_calibration_date: this.formatDateToYYYYMMDD(tm.lastCalibrationOn),
        next_calibration_date: this.formatDateToYYYYMMDD(tm.nextCalibrationDue)
      })),
      tab_5_iccp: this.iccpData.map(ic => ({
        sfd_details: typeof ic.shipEquipmentId === "number" ? ic.shipEquipmentId : null,
        nomenclature: ic.nomenclature,
        eqpt_code: ic.eqptCode,
        loc_on_board: ic.locOnBoard,
        ops_or_non_ops: ic.opsNonOps,
        non_ops_since: this.formatDateToYYYYMMDD(ic.nonOpsSince)
      })),
      tab_5_h2s: this.h2sSensorData.map(h => ({
        sfd_details: typeof h.shipEquipmentId === "number" ? h.shipEquipmentId : null,
        nomenclature: h.nomenclature,
        loc_on_board: h.locOnBoard,
        ops_or_non_ops: this.mapOpsToBackend(h.opsNonOps),
        non_ops_since: this.formatDateToYYYYMMDD(h.nonOpsSince),
        last_calibration_date: this.formatDateToYYYYMMDD(h.lastCalibratedOn),
        next_calibration_date: this.formatDateToYYYYMMDD(h.nextCalibration)
      })),
      tab_5_stp: this.stpData.map(stp => ({
        sfd_details: typeof stp.shipEquipmentId === "number" ? stp.shipEquipmentId : null,
        nomenclature: stp.nomenclature,
        loc_on_board: stp.locOnBoard,
        effluent_status: stp.status,
        effluent_test_date: this.formatDateToYYYYMMDD(stp.effluentTestDate),
        remarks: stp.remarks
      })),
      tab_5_magazine: this.mffsData.map(mffs => ({
        sfd_details: typeof mffs.shipEquipmentId === "number" ? mffs.shipEquipmentId : null,
        nomenclature: mffs.nomenclature,
        loc_on_board: mffs.locOnBoard,
        status: mffs.status,
        last_trials_taken: this.formatDateToYYYYMMDD(mffs.lastTrialsTaken),
        next_trials_due: this.formatDateToYYYYMMDD(mffs.nextTrialsDue)
      })),
      tab_6_centrifuges: this.lubOilFuelCentrifuge.map(c => ({
        sfd_details: typeof c.shipEquipmentId === "number" ? c.shipEquipmentId : null,
        eqpt_name: c.eqptName,
        nomenclature: c.nomenclature,
        eqpt_code: c.eqptCode,
        serial_no: c.serNo,
        loc_on_board: c.locOnBoard,
        ops_or_non_ops: this.mapOpsToBackend(c.opsNonOps),
        non_ops_since: this.formatDateToYYYYMMDD(c.nonOpsSince),
        // Step 6 makes these mandatory for an Ops purifier, but they were never in this
        // payload — so the two fields the user was forced to fill went nowhere.
        last_calibrated_on: this.formatDateToYYYYMMDD(c.lastCalibratedOn),
        next_calibration: this.formatDateToYYYYMMDD(c.nextCalibration)
      })),
      tab_6_test_kits: this.lubOilCoolantTestKits.map(tk => ({
        description: tk.description,
        ops_or_non_ops: tk.opsNonOps,
        calibration: this.formatDateToYYYYMMDD(tk.calibrationDate),
        next_calibration_due_date: this.formatDateToYYYYMMDD(tk.nextCalibrationDueDate)
      })),
      tab_7_safety_device_checks: this.safetyDeviceChecks.map(sdc => ({
        sfd_details: typeof sdc.shipEquipmentId === "number" ? sdc.shipEquipmentId : null,
        eqpt_name: sdc.eqptName,
        loc_on_board: sdc.locOnBoard,
        sdc_conducted_by: sdc.sdcConductedBy,
        date_of_sdc: this.formatDateToYYYYMMDD(sdc.dateOfSdc),
        sfc_in_gm_kwh: sdc.sfcGmsKWh,
        last_sfc_trial_date: this.formatDateToYYYYMMDD(sdc.lastSfcTrialDate),
        displacement_during_sfc_trial: sdc.displacementDuringSfc,
        status: sdc.status
      })),
      tab_7_calibrations: this.injectorFipCalibration.map(fip => ({
        sfd_details: typeof fip.shipEquipmentId === "number" ? fip.shipEquipmentId : null,
        eqpt_name: fip.eqptName,
        nomenclature: fip.nomenclature,
        eqpt_code: fip.eqptCode,
        loc_on_board: fip.locOnBoard,
        running_hours_months: fip.fipInMonth,
        running_hours_since_installation: fip.rhSinceInstallation,
        hrs_run_below_33_percent: fip.hrsBelow30,
        hrs_run_33_to_50_percent: fip.hrs30to50,
        hrs_run_50_to_70_percent: fip.hrs50to70,
        hrs_run_70_to_100_percent: fip.hrs70to100,
        lub_oil_consumption_in_month: fip.lubOilConsCurrentMonth,
        date_of_inj_fip_calibration: this.formatDateToYYYYMMDD(fip.dateOfInjectorCalibration),
        occasion: fip.occasionsReplacement,
        rh_at_which_replaced: fip.inOutWhichReplaced,
        fuel_consumption_in_month: fip.fuelConsumptionTons,
        remarks: fip.remarks
      })),
      tab_8_dguf: this.dgufGeneratorData.map(dg => ({
        sfd_details: typeof dg.shipEquipmentId === "number" ? dg.shipEquipmentId : null,
        serial_no: dg.eqptCode || dg.daNo,
        da_number: dg.daNo,
        rh_at_sea_and_anchorage: dg.rhSeaAnchorage,
        rh_at_port: dg.rhHarbour,
        total_rh_in_month: dg.totalRhMonth
      })),
      tab_8_dguf_running_hours: {
        total_rh_at_sea: this.dgufRunningHoursData.totalRhSea,
        hours_underway: this.dgufRunningHoursData.hrsUnderway,
        anchorage: this.dgufRunningHoursData.anchorage,
        drifting: this.dgufRunningHoursData.drifting,
        no_of_hours_in_harbour: this.dgufRunningHoursData.hrsInHarbour,
        hours_shore_supply_avl_when_alongs: this.dgufRunningHoursData.hrsShoreSupply,
        no_of_cold_moves_in_harbour: Number(this.dgufRunningHoursData.coldMoves || 0),
        cmts_wrt_to_non_avl_shore_supply: this.dgufRunningHoursData.comments,
        serial_no: "DGUF-RH"
      },
      tab_8_dguf_limits: [{
        limiting_value_sea: Number(this.dgufLimitingValues.limitingValueSea || 0),
        limiting_value_harbour: Number(this.dgufLimitingValues.limitingValueHarbour || 0),
        actual_dguf_sea: Number(this.dgufLimitingValues.actualDgufSea || 0),
        actual_dguf_harbour: Number(this.dgufLimitingValues.actualDgufHarbour || 0),
        exceed_reason_sea: this.dgufLimitingValues.reasonExceedingSea,
        exceed_reason_harbour: this.dgufLimitingValues.reasonExceedingHarbour
      }],
      tab_9_fpt_me: [{
        date: this.formatDateToYYYYMMDD(this.fptMainEngineGeneral.lastFptDate),
        displacement: Number(this.fptMainEngineGeneral.displacement || 0),
        max_speed: Number(this.fptMainEngineGeneral.maxSpeed || 0),
        occasion_reason: this.fptMainEngineGeneral.occasionReason,
        draught_fwd: Number(this.fptMainEngineGeneral.draughtFwd || 0),
        draught_aft: Number(this.fptMainEngineGeneral.draughtAft || 0),
        conducted_by: this.fptMainEngineGeneral.conductedBy,
        torsion_meter_reading: this.fptMainEngineGeneral.torsionMotorReading,
        sea_state: this.fptMainEngineGeneral.seaState,
        pending_dr_activities_reason: this.fptMainEngineGeneral.remarks
      }],
      tab_9_fpt_eq: this.fptMainEngineSpecific.map(me => ({
        sfd_details: typeof me.shipEquipmentId === "number" ? me.shipEquipmentId : null,
        eqpt_name: me.eqptName,
        nomenclature: me.nomenclature,
        eqpt_code: me.eqptCode,
        loc_on_board: me.locOnBoard,
        serial_no: me.serNo,
        fuel_rack_dbr_max: Number(me.fuelRackDbl || 0),
        marking_max: Number(me.fciThrottleMarking || 0),
        undertaken_on: this.formatDateToYYYYMMDD(me.lastEhmTrialsDate),
        pitch: me.pitch,
        max_rpm: Number(me.maxRpm || 0),
        rated_power: Number(me.ratedPower || 0),
        max_achieved_power: Number(me.maxAchievedPower || 0),
        remarks: me.remarks
      })),
      tab_9_fpt_da: this.fptDieselGeneratorLoad.map(da => ({
        sfd_details: typeof da.shipEquipmentId === "number" ? da.shipEquipmentId : null,
        eqpt_name: da.eqptName,
        nomenclature: da.nomenclature,
        eqpt_code: da.eqptCode,
        loc_on_board: da.location,
        serial_no: da.eqptSerNo,
        date: this.formatDateToYYYYMMDD(da.date),
        occasion: da.occasionReason,
        rated_load: Number(da.ratedLoad || 0),
        max_load_achieved: Number(da.maxLoadAchieved || 0),
        conducted_by: da.conductedBy,
        last_ehm_trials_undertaken_on: this.formatDateToYYYYMMDD(da.lastEhmTrialsDate),
        remarks: da.remarks
      })),
      tab_7_diesel_reduction_gear: this.dieselReductionGear.map(rg => ({
        sfd_details: typeof rg.shipEquipmentId === "number" ? rg.shipEquipmentId : null,
        eqpt_name: rg.eqptName,
        nomenclature: rg.nomenclature,
        eqpt_code: rg.eqptCode,
        loc_on_board: rg.locOnBoard,
        serial_no: rg.serNo,
        hrs_for_month: rg.hrsForMonth,
        hrs_since_installation: rg.hrsSinceInstallation
      })),
      tab_10_reduction_gear: this.gtReductionGear.map(rg => ({
        sfd_details: typeof rg.shipEquipmentId === "number" ? rg.shipEquipmentId : null,
        eqpt_name: rg.eqptName,
        nomenclature: rg.nomenclature,
        eqpt_code: rg.eqptCode,
        loc_on_board: rg.locOnBoard,
        serial_no: rg.eqptSerNo,
        total_rh_in_month: rg.totalRhInMonth,
        total_rh_si: rg.totalRhsi,
        total_rh_regime1_in_month: rg.hoRegimeBelow0_25,
        total_rh_regime1_si: rg.hoRegimeBelow0_25Si,
        total_rh_regime2_in_month: rg.hoRegime0_25to0_5,
        total_rh_regime2_si: rg.hoRegime0_25to0_5Si,
        total_rh_regime3_in_month: rg.hoRegime0_5to0_75,
        total_rh_regime3_si: rg.hoRegime0_5to0_75Si,
        trailing_rh_in_month: rg.slidingHours0_25,
        trailing_rh_si: rg.slidingHours0_25Si,
        service_life_in_month: rg.serviceLife,
        service_life_si: rg.serviceLifeSi,
        no_of_eng_regime1_in_month: rg.routineRegime1,
        no_of_eng_regime1_si: rg.routineRegime1Si,
        no_of_eng_regime2_in_month: rg.routineRegime2,
        no_of_eng_regime2_si: rg.routineRegime2Si,
        no_of_eng_regime3_in_month: rg.routineRegime3,
        no_of_eng_regime3_si: rg.routineRegime3Si,
        no_of_eng_regime4_in_month: rg.routineRegime4,
        no_of_eng_regime4_si: rg.routineRegime4Si
      })),
      tab_10_gas_turbine: this.gasTurbineExploitation.map(gt => ({
        sfd_details: typeof gt.shipEquipmentId === "number" ? gt.shipEquipmentId : null,
        eqpt_name: gt.eqptName,
        nomenclature: gt.nomenclature,
        eqpt_code: gt.eqptCode,
        loc_on_board: gt.locOnBoard,
        serial_no: gt.serNo,
        // Numeric columns fed from HH:MM inputs — see hhmmToDecimalHours(). The
        // rh_regime_*_in_mth fields beside them are CharFields, so those stay as typed.
        total_rh_in_month: this.hhmmToDecimalHours(gt.totalRhInMonth),
        total_rh_si: this.hhmmToDecimalHours(gt.totalRhSi),
        rh_regime_1_in_mth: gt.rhRegime1InMonth,
        rh_regime_1_si: this.hhmmToDecimalHours(gt.rhRegime1Si),
        rh_regime_2_in_mth: gt.rhRegime2InMonth,
        rh_regime_2_si: this.hhmmToDecimalHours(gt.rhRegime2Si),
        rh_regime_3_in_mth: gt.rhRegime3InMonth,
        rh_regime_3_si: this.hhmmToDecimalHours(gt.rhRegime3Si),
        no_of_cold_starts_in_month: Number(gt.noOfOccasion || 0),
        no_of_cold_starts_si: Number(gt.noOfRepOrders || 0),
        no_of_hot_starts_in_month: Number(gt.unscheduledEngagement || 0),
        no_of_hot_starts_si: Number(gt.fuelExploitation || 0),
        no_of_false_starts_in_month: Number(gt.gslChemQty || 0),
        no_of_false_starts_si: Number(gt.status || 0),
        no_of_tech_starts_in_month: Number(gt.rhEngine1 || 0),
        no_of_tech_starts_si: Number(gt.rhEngine2 || 0),
        no_of_astern_engagements_in_mth: gt.lastCalibrationDate,
        no_of_astern_engagements_count: Number(gt.lastEhmTrialDate || 0),
        no_of_stop_orders_in_mth: gt.lastFptDate,
        no_of_stop_orders_si: Number(gt.noOfStopOrdersSi || 0),
        last_chem_clg: this.formatDateToYYYYMMDD(gt.lastChemClg)
      })),
      tab_10_replacements: this.gtReplacementMajorAssemblies.map(rep => ({
        eqpt_name: rep.eqptName,
        eqpt_sr_number: rep.eqptSrNumber,
        serial_no: rep.eqptSrNumber,
        date_of_replacement: this.formatDateToYYYYMMDD(rep.dateOfReplacement),
        unit_sub_units: rep.subAssemblyUnitName,
        reason_for_replacement: rep.reasonOfReplacement,
        replacement_remarks: rep.remarks,
        tab_value: "GT/RG"
      })),
      tab_10_srmr: this.gtRoutinesUndertaken.map(rt => ({
        eqpt_name: rt.eqptName,
        eqpt_sr_number: rt.eqptSrNumber,
        serial_no: rt.eqptSrNumber,
        date: this.formatDateToYYYYMMDD(rt.date),
        description_of_routine: rt.descriptionForRoutine,
        undertaken_by_whom: rt.undertakenByWhom,
        tab_value: "GT/RG"
      })),
      tab_11_gtg: this.gtgExploitationData.map(gtg => ({
        sfd_details: typeof gtg.shipEquipmentId === "number" ? gtg.shipEquipmentId : null,
        eqpt_name: gtg.eqptName,
        nomenclature: gtg.nomenclature,
        eqpt_code: gtg.eqptCode,
        loc_on_board: gtg.locOnBoard,
        serial_no: gtg.serNo,
        total_rh_in_harbour: gtg.rhInHarbour,
        total_rh_in_sea: gtg.rhInSea,
        total_rh_in_month: gtg.totalRhInMonth,
        total_rh_si: gtg.totalRhsi,
        no_of_cold_starts_in_month: Number(gtg.noOfColdStarts || 0),
        no_of_cold_starts_si: Number(gtg.noOfColdStartsSi || 0),
        no_of_hot_starts_in_month: Number(gtg.noOfHotStarts || 0),
        no_of_hot_starts_si: Number(gtg.noOfHotStartsSi || 0),
        no_of_battery_cold_starts_in_month: Number(gtg.noOfBatteryColdStarts || 0),
        no_of_battery_cold_starts_si: Number(gtg.noOfBatteryColdStartsSi || 0),
        no_of_battery_hot_starts_in_month: Number(gtg.noOfBatteryHotStarts || 0),
        no_of_battery_hot_starts_si: Number(gtg.noOfBatteryHotStartsSi || 0),
        date: this.formatDateToYYYYMMDD(gtg.lastChemClgDateReason)
      })),
      tab_11_gtg_rg: this.gtgReductionGear.map(rg => ({
        sfd_details: typeof rg.shipEquipmentId === "number" ? rg.shipEquipmentId : null,
        eqpt_name: rg.eqptName,
        nomenclature: rg.nomenclature,
        eqpt_code: rg.eqptCode,
        loc_on_board: rg.locOnBoard,
        serial_no: rg.serNo,
        rg_running_hours: Number(rg.rgRunningHours || 0),
        no_of_hot_starts: Number(rg.noOfHotStarts || 0),
        no_of_cold_starts: Number(rg.noOfColdStarts || 0),
        rh_in_harbour: Number(rg.rhInHarbour || 0),
        rh_in_sea: Number(rg.rhInSea || 0),
        in_months_si: Number(rg.inMonthsSi || 0)
      })),
      tab_11_gtg_rep: this.gtgReplacementMajorAssemblies.map(rep => ({
        eqpt_name: rep.eqptName,
        eqpt_sr_number: rep.eqptSrNumber,
        serial_no: rep.eqptSrNumber,
        date: this.formatDateToYYYYMMDD(rep.dateOfReplacement),
        unit_sub_units: rep.subAssemblyUnitName,
        reason_for_replacement: rep.reasonOfReplacement,
        replacement_remarks: rep.remarks
      })),
      tab_11_gtg_srmr: this.gtgRoutinesUndertaken.map(rt => ({
        eqpt_name: rt.eqptName,
        eqpt_sr_number: rt.eqptSrNumber,
        serial_no: rt.eqptSrNumber,
        date: this.formatDateToYYYYMMDD(rt.date),
        description_of_routine: rt.descriptionForRoutine,
        undertaken_by_whom: rt.undertakenByWhom
      })),
      tab_12_lubricants: this.lubricantData,
      tab_13_rh_extensions: [
        ...this.mainEngineRHExtensions.map((rh: RhExtensionItem) => ({
          sfd_details: typeof rh.shipEquipmentId === "number" ? rh.shipEquipmentId : null,
          eqpt_name: rh.eqptName,
          nomenclature: rh.nomenclature,
          loc_on_board: rh.location,
          serial_no: rh.serNo,
          total_rh_in_month: rh.rhdi,
          on_routine: typeof rh.onRoutineId === "number" ? rh.onRoutineId : null,
          on_routine_text: rh.onRoutine,
          rh_ext_at_conduct_of_ext_trial: rh.rhDuringTrial,
          authority_letter_for_extension_trial: rh.authorityLetterRef,
          rh_extension_granted_upto: rh.rhExtensionGranted,
          rh_left_for_expiry_of_extension: rh.rhLeftExpiry,
          equipment_type: 1,
          trial_conducted_by: rh.trialConductedBy
        })),
        ...this.dieselAlternatorRHExtensions.map((rh: RhExtensionItem) => ({
          sfd_details: typeof rh.shipEquipmentId === "number" ? rh.shipEquipmentId : null,
          eqpt_name: rh.eqptName,
          nomenclature: rh.nomenclature,
          loc_on_board: rh.location,
          serial_no: rh.serNo,
          total_rh_in_month: rh.rhdi,
          on_routine: typeof rh.onRoutineId === "number" ? rh.onRoutineId : null,
          on_routine_text: rh.onRoutine,
          rh_ext_at_conduct_of_ext_trial: rh.rhDuringTrial,
          authority_letter_for_extension_trial: rh.authorityLetterRef,
          rh_extension_granted_upto: rh.rhExtensionGranted,
          rh_left_for_expiry_of_extension: rh.rhLeftExpiry,
          equipment_type: 2,
          trial_conducted_by: rh.trialConductedBy
        }))
      ],
      tab_14_eef: {
        designed: this.eefData.designed,
        actual: this.calculatedEEF || null,
        reason_for_exceeding: this.eefData.reasonExceeding,
        ship_remarks: this.eefData.shipRemarks
      }
    };
  }

  saveReportPayload(isFinalSubmission = false, callback?: (success: boolean) => void) {
    const payload = this.constructCompositePayload(isFinalSubmission);
    this.srarService.saveCompositeSrar(payload).subscribe({
      next: (res: SrarApiResponse) => {
        if (res && res["id"]) {
          this.srarId = res["id"] as number;
        }
        this.loadDashboard();
        // Re-pull this report's saved rows (and their real backend ids) after every save.
        // Every tab's save payload is rebuilt from in-memory state, and the backend only
        // updates a row already-in-memory refers to when its real id comes back with it —
        // otherwise the next save resends that row without an id, and the backend treats
        // it as brand new: inserting a duplicate and deleting the original as "stale" (see
        // _sync_relation). Refreshing here keeps every subsequent save's ids accurate
        // instead of only fixing it for Tab 1.
        if (this.srarId) {
          this.loadReportDetails(this.srarId);
        }
        if (callback) callback(true);
      },
      error: (err: unknown) => {
        console.error("Failed to save report:", err);
        this.appService.openAlert("Error", "Failed to save SRAR Report. Please verify entries and try again.");
        if (callback) callback(false);
      }
    });
  }

  submitSRAR() {
    this.saveReportPayload(true, (success?: boolean) => {
      if (success) {
        this.appService.openAlert("Success", "SRAR Report Finalized and Submitted successfully", () => {
          this.showDetails.set(false);
          this.activeSubTab.set(1);
        });
      }
    });
  }

  getStatusClass(status: string): string {
    switch (status) {
      case "Approved":
        return "badge-success";
      case "In Review":
        return "badge-warning";
      case "Draft":
        return "badge-secondary";
      case "Pending":
      default:
        return "badge-info";
    }
  }
}
