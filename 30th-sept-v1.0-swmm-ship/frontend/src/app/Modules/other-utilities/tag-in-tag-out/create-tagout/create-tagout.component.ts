import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import {
  CommonApiService,
  CreateTagoutPayload,
  CurrentUserResponse,
  DepartmentItem,
} from "../../../../Core/http/services/api.service";

const HELP_HTML = `<p class="mb-0">Raise a new tag out to isolate a piece of equipment. Fill in the equipment, status/type, and scheduling details, then the reason-specific section (TY Loan, Survey and Demand, Repair/Overhaul, or ABER Replacement) that appears based on the Tag Out Reason selected.</p>`;

export interface EquipmentOption {
  id: number;
  name: string;
}

export interface SelectOption {
  value: string;
  label: string;
}

interface EquipmentItem {
  id?: number | string;
  name?: string;
  nomenclature?: string;
  equipment_name?: string;
  label?: string;
}

interface EquipmentDropdownResponse {
  ship_equipments?: EquipmentItem[];
  equipments?: EquipmentItem[];
  equipment?: EquipmentItem[];
}

@Component({
  selector: "app-create-tagout",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, HelpGuidance, SelectInput, ButtonComponent],
  templateUrl: "./create-tagout.component.html",
  styleUrl: "./create-tagout.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTagoutComponent implements OnInit {
  private readonly commonApiService = inject(CommonApiService);
  private readonly router = inject(Router);

  readonly helpHtml = HELP_HTML;

  // Header / Readonly Fields
  readonly date = signal<string>(new Date().toISOString().slice(0, 10));
  readonly ship = signal<string>("WNC");
  readonly department = signal<string>("Executive");

  // Form Field Signals
  readonly tagoutEquipmentName = signal<number | null>(null);
  readonly nameOfSubSystem = signal<string>("");
  readonly nameOfComponent = signal<string>("");
  readonly serialNoOfComponent = signal<string>("");
  readonly patternNoOfComponent = signal<string>("");
  readonly weightOfItem = signal<string>("");
  readonly type = signal<string>("Danger");
  readonly condition = signal<string>("Ops");
  readonly specialInstructions = signal<string>("");
  readonly departmentAffected = signal<string>("");
  readonly expectedDateOfTagin = signal<string>("");
  readonly tagoutReason = signal<string>("ty_loan_rtlapp");
  readonly tagoutDescription = signal<string>("");
  readonly tagoutMaintainer = signal<string>("Cdr Hod ENG");

  // Conditional Fields: TY Loan / RTLAPP
  readonly tyLoanShip = signal<string>("");
  readonly tyAuthority = signal<string>("");
  readonly tyItemTakenBy = signal<string>("");
  readonly tyAdditionalItems = signal<string>("");

  // Conditional Fields: Survey & Demand
  readonly surveryDemandAuthority = signal<string>("");

  // Conditional Fields: Repair / Overhauling
  readonly repairRaNumber = signal<string>("");
  readonly repairLandedDetails = signal<string>("");
  readonly repairItemTakenBy = signal<string>("");
  readonly repairAdditionalItems = signal<string>("");

  // Conditional Fields: ABER Replacement
  readonly aberAuthority = signal<string>("");
  readonly replacementItem = signal<string>("");
  readonly estimatedBomArrivalDate = signal<string>("");

  // State Signals
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Master Dropdown Options
  readonly equipmentOptions = signal<EquipmentOption[]>([]);
  readonly departmentOptions = signal<DepartmentItem[]>([]);

  readonly reasonOptions = signal<SelectOption[]>([
    { value: "ty_loan_rtlapp", label: "TY Loan / RTLAPP" },
    { value: "survey_and_demand", label: "Survey & Demand" },
    { value: "repair_or_overhauling", label: "Repair / Overhauling" },
    { value: "aber_replacement", label: "ABER Replacement" },
    { value: "consumable_survey", label: "Consumable Survey" },
  ]);

  readonly formattedEquipmentOptions = computed<DropdownOption[]>(() =>
    this.equipmentOptions().map((opt) => ({
      label: opt.name,
      value: opt.id,
    })),
  );

  readonly formattedDepartmentOptions = computed<DropdownOption[]>(() =>
    this.departmentOptions().map((dept) => ({
      label: dept.name,
      value: String(dept.id),
    })),
  );

  readonly formattedReasonOptions = computed<DropdownOption[]>(() =>
    this.reasonOptions().map((reason) => ({
      label: reason.label,
      value: reason.value,
    })),
  );

  ngOnInit(): void {
    this.loadEquipmentDropdowns();
    this.loadDepartments();
    this.loadCurrentUserProfile();
  }

  private loadEquipmentDropdowns(): void {
    this.commonApiService.getTagoutShipEquipments().subscribe({
      next: (res: EquipmentDropdownResponse | EquipmentItem[]) => {
        const rawList = Array.isArray(res)
          ? res
          : (res?.ship_equipments || res?.equipments || []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const list: EquipmentOption[] = rawList
            .filter((e: EquipmentItem) => e?.id !== undefined && e?.id !== null)
            .map((e: EquipmentItem) => ({
              id: Number(e.id),
              name: e.nomenclature || e.name || e.equipment_name || `Equipment #${e.id}`,
            }));
          if (list.length > 0) {
            this.equipmentOptions.set(list);
            return;
          }
        }
        this.loadTagoutFormMetaFallback();
      },
      error: () => {
        this.loadTagoutFormMetaFallback();
      },
    });
  }

  private loadTagoutFormMetaFallback(): void {
    this.commonApiService.getTagoutFormMeta().subscribe({
      next: (res: EquipmentDropdownResponse | EquipmentItem[]) => {
        const rawList = Array.isArray(res)
          ? res
          : (res?.ship_equipments || res?.equipments || []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const list: EquipmentOption[] = rawList
            .filter((e: EquipmentItem) => e?.id !== undefined && e?.id !== null)
            .map((e: EquipmentItem) => ({
              id: Number(e.id),
              name: e.nomenclature || e.name || e.equipment_name || `Equipment #${e.id}`,
            }));
          if (list.length > 0) {
            this.equipmentOptions.set(list);
            return;
          }
        }
        this.loadEquipmentFallback();
      },
      error: () => {
        this.loadEquipmentFallback();
      },
    });
  }

  private loadEquipmentFallback(): void {
    this.commonApiService.getEquipmentSystemDropdowns().subscribe({
      next: (res: EquipmentDropdownResponse | EquipmentItem[]) => {
        const items = Array.isArray(res)
          ? res
          : (res?.ship_equipments || res?.equipments || res?.equipment || []);
        if (items && Array.isArray(items) && items.length > 0) {
          const list: EquipmentOption[] = items
            .filter((e: EquipmentItem) => e?.id !== undefined && e?.id !== null)
            .map((e: EquipmentItem) => ({
              id: Number(e.id),
              name: e.nomenclature || e.name || e.equipment_name || e.label || `Equipment #${e.id}`,
            }));
          if (list.length > 0) {
            this.equipmentOptions.set(list);
          }
        }
      },
      error: () => {
        // Keeps options clean if no backend items found
      },
    });
  }

  private loadDepartments(): void {
    this.commonApiService.getDepartments().subscribe({
      next: (depts: DepartmentItem[]) => {
        if (Array.isArray(depts) && depts.length > 0) {
          this.departmentOptions.set(depts);
          if (!this.departmentAffected() && depts[0]) {
            this.departmentAffected.set(String(depts[0].id));
          }
        }
      },
      error: () => {
        // Keeps default clean options
      },
    });
  }

  private loadCurrentUserProfile(): void {
    this.commonApiService.getCurrentUser().subscribe({
      next: (res: CurrentUserResponse) => {
        const profile = res?.profile;
        if (!profile) return;

        // Auto-populate Department text & affected department ID
        const deptName = profile.department_detail?.name || profile.section;
        if (deptName) {
          this.department.set(deptName);
        }
        if (profile.department) {
          this.departmentAffected.set(String(profile.department));
        }

        // Auto-populate Ship
        const shipName =
          profile.command_name_detail?.unit_name ||
          profile.command_name_detail?.command_name;
        if (shipName) {
          this.ship.set(shipName);
        }

        // Auto-populate Maintainer Name & Rank
        const rankName = profile.rank_detail?.name || "";
        const firstName = profile.firstname || "";
        const lastName = profile.lastname || "";
        const fullName =
          `${rankName} ${firstName} ${lastName}`.trim() || profile.designation;
        if (fullName) {
          this.tagoutMaintainer.set(fullName);
        }
      },
      error: () => {
        // Keeps default clean values on error
      },
    });
  }

  onTypeChange(val: "Danger" | "Warning"): void {
    this.type.set(val);
    if (val === "Danger") {
      this.specialInstructions.set("");
    }
  }

  onReasonChange(val: string): void {
    this.tagoutReason.set(val);
    if (val !== "ty_loan_rtlapp") {
      this.tyLoanShip.set("");
      this.tyAuthority.set("");
      this.tyItemTakenBy.set("");
      this.tyAdditionalItems.set("");
    }
    if (val !== "survey_and_demand") {
      this.surveryDemandAuthority.set("");
    }
    if (val !== "repair_or_overhauling") {
      this.repairRaNumber.set("");
      this.repairLandedDetails.set("");
      this.repairItemTakenBy.set("");
      this.repairAdditionalItems.set("");
    }
    if (val !== "aber_replacement") {
      this.aberAuthority.set("");
      this.replacementItem.set("");
      this.estimatedBomArrivalDate.set("");
    }
  }

  onlyNumberKey(event: KeyboardEvent): void {
    const allowedKeys = [
      "Backspace", "Delete", "Tab", "Escape", "Enter",
      "ArrowLeft", "ArrowRight", "Home", "End",
    ];
    if (allowedKeys.includes(event.key) || event.ctrlKey || event.metaKey) {
      return;
    }
    if (!/^[0-9.]$/.test(event.key) || (event.key === "." && this.weightOfItem().includes("."))) {
      event.preventDefault();
    }
  }

  onWeightInput(val: string): void {
    let sanitized = val.replace(/[^0-9.]/g, "");
    const parts = sanitized.split(".");
    if (parts.length > 2) {
      sanitized = parts[0] + "." + parts.slice(1).join("");
    }
    this.weightOfItem.set(sanitized);
  }

  readonly formSubmitted = signal<boolean>(false);

  isFieldInvalid(field: string): boolean {
    return !!this.getFieldErrorMsg(field);
  }

  getFieldErrorMsg(field: string): string {
    if (!this.formSubmitted()) return '';
    return this.getBasicFieldError(field) || this.getReasonFieldError(field);
  }

  private getBasicFieldError(field: string): string {
    switch (field) {
      case 'tagoutEquipmentName': return !this.tagoutEquipmentName() ? 'Equipment Name is required.' : '';
      case 'nameOfSubSystem': return !this.nameOfSubSystem()?.trim() ? 'Sub System Name is required.' : '';
      case 'nameOfComponent': return !this.nameOfComponent()?.trim() ? 'Component Name is required.' : '';
      case 'serialNoOfComponent': return !this.serialNoOfComponent()?.trim() ? 'Serial No is required.' : '';
      case 'expectedDateOfTagin': return !this.expectedDateOfTagin() ? 'Expected Date is required.' : '';
      default: return '';
    }
  }

  private getReasonFieldError(field: string): string {
    const reason = this.tagoutReason();
    if (reason === 'ty_loan_rtlapp') return this.getTyLoanFieldError(field);
    if (reason === 'survey_and_demand') return field === 'surveryDemandAuthority' && !this.surveryDemandAuthority()?.trim() ? 'Authority is required.' : '';
    if (reason === 'repair_or_overhauling') return this.getRepairFieldError(field);
    if (reason === 'aber_replacement') return this.getAberFieldError(field);
    return '';
  }

  private getTyLoanFieldError(field: string): string {
    switch (field) {
      case 'tyLoanShip': return !this.tyLoanShip()?.trim() ? 'Ty Loan Ship is required.' : '';
      case 'tyAuthority': return !this.tyAuthority()?.trim() ? 'Authority is required.' : '';
      case 'tyItemTakenBy': return !this.tyItemTakenBy()?.trim() ? 'Item Taken By is required.' : '';
      case 'tyAdditionalItems': return !this.tyAdditionalItems()?.trim() ? 'Additional Items is required.' : '';
      default: return '';
    }
  }

  private getRepairFieldError(field: string): string {
    switch (field) {
      case 'repairRaNumber': return !this.repairRaNumber()?.trim() ? 'RA Number is required.' : '';
      case 'repairLandedDetails': return !this.repairLandedDetails()?.trim() ? 'OEM Details is required.' : '';
      case 'repairItemTakenBy': return !this.repairItemTakenBy()?.trim() ? 'Item Taken By is required.' : '';
      case 'repairAdditionalItems': return !this.repairAdditionalItems()?.trim() ? 'Additional Items is required.' : '';
      default: return '';
    }
  }

  private getAberFieldError(field: string): string {
    switch (field) {
      case 'aberAuthority': return !this.aberAuthority()?.trim() ? 'Authority is required.' : '';
      case 'replacementItem': return !this.replacementItem()?.trim() ? 'Replacement Item is required.' : '';
      default: return '';
    }
  }

  onSubmit(): void {
    this.formSubmitted.set(true);
    if (this.isSubmitting()) return;

    const validationError = this.validateForm();
    if (validationError) {
      this.errorMessage.set(validationError);
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const payload = this.buildPayload();
    this.commonApiService.createTagout(payload).subscribe({
      next: () => this.handleSuccess(),
      error: (err: unknown) => this.handleError(err),
    });
  }

  private validateForm(): string | null {
    return this.validateBasicFields() || this.validateReasonFields();
  }

  private validateBasicFields(): string | null {
    if (!this.tagoutEquipmentName()) return "Please select TagOut Equipment Name.";
    if (!this.nameOfSubSystem().trim()) return "Please enter Name Of Sub System.";
    if (!this.nameOfComponent().trim()) return "Please enter Name Of Component.";
    if (!this.serialNoOfComponent().trim()) return "Please enter Serial No Of Component.";
    if (!this.expectedDateOfTagin()) return "Please select Expected Date Of Tag in.";
    if (this.isInvalidWeight()) return "Weight of Item must be a valid number.";
    return null;
  }

  private isInvalidWeight(): boolean {
    const weight = this.weightOfItem().trim();
    return weight !== "" && (Number.isNaN(Number(weight)) || Number(weight) < 0);
  }

  private validateReasonFields(): string | null {
    const reason = this.tagoutReason();
    switch (reason) {
      case "ty_loan_rtlapp":
        return this.validateTyLoanFields();
      case "survey_and_demand":
        return this.validateSurveyDemandFields();
      case "repair_or_overhauling":
        return this.validateRepairFields();
      case "aber_replacement":
        return this.validateAberFields();
      default:
        return null;
    }
  }

  private validateTyLoanFields(): string | null {
    if (!this.tyLoanShip().trim()) return "Please enter Ty Loan Ship.";
    if (!this.tyAuthority().trim()) return "Please enter Authority for Ty Loan / RTLAPP.";
    if (!this.tyItemTakenBy().trim()) return "Please enter Item Taken By.";
    if (!this.tyAdditionalItems().trim()) return "Please enter Any Additional Items.";
    return null;
  }

  private validateSurveyDemandFields(): string | null {
    if (!this.surveryDemandAuthority().trim()) return "Please enter Authority for Survey & Demand.";
    return null;
  }

  private validateRepairFields(): string | null {
    if (!this.repairRaNumber().trim()) return "Please enter RA Number for Repair / Overhauling.";
    if (!this.repairLandedDetails().trim()) return "Please enter Landed In Centre No. / OEM Details.";
    if (!this.repairItemTakenBy().trim()) return "Please enter Item Taken By.";
    if (!this.repairAdditionalItems().trim()) return "Please enter Any Additional Items.";
    return null;
  }

  private validateAberFields(): string | null {
    if (!this.aberAuthority().trim()) return "Please enter Authority for ABER Replacement.";
    if (!this.replacementItem().trim()) return "Please enter Replacement Item.";
    return null;
  }

  private getConditionValue(): string {
    const cond = this.condition();
    if (cond === "Non Ops") return "non_ops";
    if (cond === "Partially Ops") return "partially_ops";
    return "ops";
  }

  private getEquipmentPk(): number {
    const val = Number(this.tagoutEquipmentName());
    return !Number.isNaN(val) ? val : 0;
  }

  private buildPayload(): CreateTagoutPayload {
    const typeValue = this.type() ? this.type().toLowerCase() : "danger";
    const conditionValue = this.getConditionValue();
    const equipPk = this.getEquipmentPk();
    const reasonSlug = this.tagoutReason() || "ty_loan_rtlapp";
    const defaultDate = this.date() || new Date().toISOString().slice(0, 10);

    const descText =
      this.tagoutDescription().trim() ||
      `TagOut initiated for ${this.nameOfComponent() || this.nameOfSubSystem() || "Equipment"}`;

    return {
      date: defaultDate,
      tagout_equipment_name: equipPk,
      name_of_subsystem: this.nameOfSubSystem() || "N/A",
      name_of_component: this.nameOfComponent() || "N/A",
      serial_number_of_component: this.serialNoOfComponent() || "N/A",
      serial_no_of_component: this.serialNoOfComponent() || "N/A",
      pattern_number_of_component: this.patternNoOfComponent() || "N/A",
      pattern_no_of_components: this.patternNoOfComponent() || "N/A",
      weight_of_component: this.weightOfItem() || "0",
      weight_of_item: this.weightOfItem() || "0",
      type: typeValue,
      condition: conditionValue,
      special_instructions: this.specialInstructions() || "None",
      departments_affected: [Number(this.departmentAffected()) || 1],
      department_affected: [Number(this.departmentAffected()) || 1],
      expected_date_of_tagin: this.expectedDateOfTagin() || defaultDate,
      tagout_reason: reasonSlug,
      tag_out_reason: reasonSlug,
      tagout_description: descText,
      tagout_maintainer_name_rank: this.tagoutMaintainer() || "Cdr Hod ENG",

      ty_loan_ship: this.tyLoanShip() || "",
      ty_authority: this.tyAuthority() || "",
      authority: this.tyAuthority() || "",
      ty_item_taken_by: this.tyItemTakenBy() || "",
      item_taken_by: this.tyItemTakenBy() || "",
      ty_additional_items: this.tyAdditionalItems() || "",
      additional_items: this.tyAdditionalItems() || "",

      survery_demand_authority: this.surveryDemandAuthority() || "",
      survey_authority: this.surveryDemandAuthority() || "",

      repair_ra_number: this.repairRaNumber() || "",
      ra_number: this.repairRaNumber() || "",
      repair_landed_details: this.repairLandedDetails() || "",
      oem_details: this.repairLandedDetails() || "",
      repair_item_taken_by: this.repairItemTakenBy() || "",
      repair_additional_items: this.repairAdditionalItems() || "",

      aber_authority: this.aberAuthority() || "",
      replacement_item: this.replacementItem() || "",
      estimated_bom_arrival_date:
        this.estimatedBomArrivalDate() || this.expectedDateOfTagin() || defaultDate,
    };
  }

  private handleSuccess(): void {
    this.isSubmitting.set(false);
    this.successMessage.set("TagOut submitted successfully!");
    setTimeout(() => {
      this.goBack();
    }, 1200);
  }

  private handleError(err: unknown): void {
    console.error("POST api/v1/inout-tags/tagouts/ error:", err);
    this.isSubmitting.set(false);

    const errObj = err as { error?: unknown; message?: string; status?: number };
    let msg = this.extractErrorMessage(errObj);

    if (errObj?.status === 0 || msg.includes("isTrusted")) {
      msg = "Unable to connect to the backend server. Please ensure the backend server is running.";
    }

    this.errorMessage.set(msg);
  }

  private extractErrorMessage(errObj: { error?: unknown; message?: string }): string {
    if (typeof errObj?.error === "string") {
      return errObj.error;
    }
    if (typeof errObj?.error === "object" && errObj.error !== null) {
      return this.parseErrorRecord(errObj.error as Record<string, unknown>);
    }
    if (errObj?.message) {
      return errObj.message;
    }
    return "Failed to submit TagOut.";
  }

  private parseErrorRecord(errRecord: Record<string, unknown>): string {
    if ("isTrusted" in errRecord || (typeof ProgressEvent !== "undefined" && errRecord instanceof ProgressEvent)) {
      return "Unable to connect to the backend server. Please ensure the backend server is running.";
    }

    const errs: string[] = [];
    for (const [key, val] of Object.entries(errRecord)) {
      errs.push(`${key}: ${this.formatErrorVal(val)}`);
    }
    return errs.join("; ") || "Server validation error occurred.";
  }

  private formatErrorVal(val: unknown): string {
    if (Array.isArray(val)) {
      return val.join(", ");
    }
    if (typeof val === "string") {
      return val;
    }
    return JSON.stringify(val);
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/other-utilities/tag-in-tag-out/tag-out"]);
  }
}
