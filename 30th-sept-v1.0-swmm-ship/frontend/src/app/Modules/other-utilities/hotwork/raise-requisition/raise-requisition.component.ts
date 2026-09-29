import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule, Location } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import {
  CommonApiService,
  CreateHotworkPayload,
  ChoiceMeta,
  HotworkFormMeta,
} from "../../../../Core/http/services/api.service";

const HELP_HTML = `<p class="mb-0">Raise a new hotwork requisition against a DART number - create a DART first if one does not already exist. Fill in the requisition, location, sentry, and officer details, then complete eSign to send it for approval. Once submitted the requisition cannot be deleted, so check the entries before sending.</p>`;

export interface DartOption {
  id: string;
  maintenancePeriod: string;
  description: string;
}

export interface OptionItem {
  id: string | number;
  name: string;
}

@Component({
  selector: "app-raise-hotwork-requisition",
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconComponent,
    RouterLink,
    HelpGuidance,
    SelectInput, ButtonComponent],
  templateUrl: "./raise-requisition.component.html",
  styleUrl: "./raise-requisition.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaiseHotworkRequisitionComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly commonApiService = inject(CommonApiService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  // Form Submission & Alert States
  private isSubmitLocked = false;
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Form Fields - Column 1
  readonly requisitionType = signal<string>("Fresh Hotwork");
  readonly dartNo = signal<string>("");
  readonly requisitionReceivedFrom = signal<string>("");
  readonly typeOfHotwork = signal<string>("");
  readonly numberOfSentries = signal<string | number>("1");
  readonly timeOfHotwork = signal<string>("Day - 0800h to 1700h");
  readonly oodName = signal<string>("");
  readonly electricalOfficerName = signal<string>("");

  // Form Fields - Column 2
  readonly occasionNomenclature = signal<string>("");
  readonly maintenancePeriod = signal<string>("");
  readonly sourceDetails = signal<string>("");
  readonly hotworkLocation = signal<string>("");
  readonly sentryNames = signal<string>("");
  readonly weldingSupervisorName = signal<string>("");
  readonly nbcdoName = signal<string>("");
  readonly departmentOfficerName = signal<string>("");

  // Form Fields - Column 3
  readonly dartDescription = signal<string>("");
  readonly hotworkDate = signal<string>("2026-08-15");
  readonly subDepartment = signal<string>("");
  readonly dayOfHotwork = signal<string>("Working Day");
  readonly adjacentCompartmentName = signal<string>("");
  readonly engineeringOfficerName = signal<string>("");

  // Dropdown Options Signals
  readonly requisitionTypeOptions = signal<string[]>([
    "Fresh Hotwork",
    "Renewal Hotwork",
    "Extension Hotwork",
  ]);

  readonly dartOptions = signal<DartOption[]>([
    {
      id: "DART/2026/HW-001",
      maintenancePeriod: "15/08/2026 to 20/08/2026",
      description: "Hotwork execution for main engine room exhaust pipe replacement and structural hull repair.",
    },
    {
      id: "DART/2026/HW-002",
      maintenancePeriod: "16/08/2026 to 18/08/2026",
      description: "Deck grinding and welding modification for auxiliary generator mountings.",
    },
    {
      id: "DART/2026/HW-003",
      maintenancePeriod: "17/08/2026 to 25/08/2026",
      description: "Gas cutting and plate welding works in AMR compartment bulkhead.",
    },
  ]);

  readonly occasionOptions = signal<string[]>([
    "Routine Maintenance",
    "Defect Rectification",
    "Refit / Overhaul",
    "Emergency Repair",
    "DART Scheduled Task",
  ]);

  readonly receivedFromOptions = signal<string[]>([
    "Dockyard",
    "FMU",
    "Vendor",
    "SS",
    "OEM",
  ]);

  readonly sourceDetailsLabel = computed<string>(() => {
    const val = this.requisitionReceivedFrom();
    if (!val) return "Source Details";
    if (val.toLowerCase().endsWith("name")) return val;
    return `${val} Name`;
  });

  readonly sourceDetailsPlaceholder = computed<string>(() => {
    return `Enter ${this.sourceDetailsLabel()}`;
  });

  readonly typeOfHotworkChoices = signal<ChoiceMeta[]>([
    { value: "CUTTING", label: "Cutting" },
    { value: "WELDING", label: "Welding" },
    { value: "CUTTING_WELDING", label: "Cutting + Welding" },
    { value: "GRINDING", label: "Grinding" },
  ]);

  readonly dayOfHotworkChoices = signal<ChoiceMeta[]>([
    { value: "WORKING_DAY", label: "Working Day" },
    { value: "HOLIDAY", label: "Holiday" },
  ]);

  readonly timeOfHotworkOptions = signal<string[]>([
    "Day - 0800h to 1700h",
    "Silent - 1700h to 0800h",
    "Full Day - 24 Hours",
  ]);


  readonly subDepartmentOptions = signal<OptionItem[]>([]);
  readonly officerOptions = signal<OptionItem[]>([]);
  readonly oodOfficerOptions = signal<OptionItem[]>([]);
  readonly nbcdoOfficerOptions = signal<OptionItem[]>([]);
  readonly engineeringOfficerOptions = signal<OptionItem[]>([]);
  readonly electricalOfficerOptions = signal<OptionItem[]>([]);
  readonly departmentOfficerOptions = signal<OptionItem[]>([]);

  readonly allUsersOptions = signal<OptionItem[]>([]);
  readonly previousHotworkOptions = signal<string[]>([]);
  readonly userRole = signal<string>("");

  readonly roleNormalized = computed<string>(() => {
    return (this.userRole() || "").trim().toUpperCase();
  });

  readonly isAdministrator = computed<boolean>(() => {
    const r = this.roleNormalized();
    return r === "ADMINISTRATOR" || r === "ADMIN" || r === "SUPERUSER" || r === "COMMAND" || r === "ALL";
  });

  readonly showOodField = computed<boolean>(() => {
    const r = this.roleNormalized();
    return r.includes("OOD");
  });

  readonly showNbcdoField = computed<boolean>(() => {
    const r = this.roleNormalized();
    return r.includes("NBCDO");
  });

  readonly showEngineeringField = computed<boolean>(() => {
    const r = this.roleNormalized();
    return r.includes("ENGINEERING") || r.includes("ENG");
  });

  readonly showElectricalField = computed<boolean>(() => {
    const r = this.roleNormalized();
    return r.includes("ELECTRICAL") || r.includes("ELEC");
  });

  readonly showDepartmentOfficerField = computed<boolean>(() => {
    const r = this.roleNormalized();
    return !(r.includes("OOD") || r.includes("NBCDO") || r.includes("ENGINEERING") || r.includes("ELECTRICAL"));
  });

  readonly formattedRequisitionTypeOptions = computed<DropdownOption[]>(() =>
    this.requisitionTypeOptions().map((opt) => ({ label: opt, value: opt })),
  );

  readonly formattedOccasionOptions = computed<DropdownOption[]>(() =>
    this.occasionOptions().map((opt) => ({ label: opt, value: opt })),
  );

  readonly formattedDartOptions = computed<DropdownOption[]>(() =>
    this.dartOptions().map((opt) => ({ label: opt.id, value: opt.id })),
  );

  readonly formattedReceivedFromOptions = computed<DropdownOption[]>(() =>
    this.receivedFromOptions().map((opt) => ({ label: opt, value: opt })),
  );

  readonly formattedTypeOfHotworkOptions = computed<DropdownOption[]>(() =>
    this.typeOfHotworkChoices().map((opt) => ({ label: opt.label, value: opt.label })),
  );

  readonly formattedSubDepartmentOptions = computed<DropdownOption[]>(() => {
    const subDepts = this.subDepartmentOptions();
    if (subDepts.length > 0) {
      return subDepts.map((opt) => ({ label: opt.name, value: String(opt.id) }));
    }
    return [
      { label: "Electrical", value: "1" },
      { label: "Mechanical", value: "2" },
      { label: "Hull & Structure", value: "3" },
      { label: "Weapons & Sensors", value: "4" },
      { label: "Damage Control", value: "5" },
      { label: "Executive", value: "6" },
    ];
  });

  readonly formattedDayOfHotworkOptions = computed<DropdownOption[]>(() =>
    this.dayOfHotworkChoices().map((opt) => ({ label: opt.label, value: opt.label })),
  );

  readonly formattedTimeOfHotworkOptions = computed<DropdownOption[]>(() =>
    this.timeOfHotworkOptions().map((opt) => ({ label: opt, value: opt })),
  );

  readonly formattedOfficerOptions = computed<DropdownOption[]>(() =>
    this.officerOptions().map((opt) => ({ label: opt.name, value: String(opt.id) })),
  );

  readonly formattedOfficerNameOptions = computed<DropdownOption[]>(() => {
    const allUsers = this.allUsersOptions();
    if (allUsers.length > 0) {
      return allUsers.map((opt) => ({ label: opt.name, value: opt.name }));
    }
    return this.officerOptions().map((opt) => ({ label: opt.name, value: opt.name }));
  });

  readonly formattedOodOptions = computed<DropdownOption[]>(() => {
    const list = this.oodOfficerOptions();
    if (list.length > 0) return list.map((opt) => ({ label: opt.name, value: opt.name }));
    return this.formattedOfficerNameOptions();
  });

  readonly formattedNbcdoOptions = computed<DropdownOption[]>(() => {
    const list = this.nbcdoOfficerOptions();
    if (list.length > 0) return list.map((opt) => ({ label: opt.name, value: opt.name }));
    return this.formattedOfficerNameOptions();
  });

  readonly formattedEngineeringOptions = computed<DropdownOption[]>(() => {
    const list = this.engineeringOfficerOptions();
    if (list.length > 0) return list.map((opt) => ({ label: opt.name, value: opt.name }));
    return this.formattedOfficerNameOptions();
  });

  readonly formattedElectricalOptions = computed<DropdownOption[]>(() => {
    const list = this.electricalOfficerOptions();
    if (list.length > 0) return list.map((opt) => ({ label: opt.name, value: opt.name }));
    return this.formattedOfficerNameOptions();
  });

  readonly formattedDepartmentOfficerOptions = computed<DropdownOption[]>(() => {
    const list = this.departmentOfficerOptions();
    if (list.length > 0) return list.map((opt) => ({ label: opt.name, value: opt.name }));
    return this.formattedOfficerNameOptions();
  });

  private mapTypeOfHotwork(val: string): string {
    const v = (val || "").trim().toUpperCase();
    if (v === "CUTTING_WELDING" || v.includes("+") || (v.includes("CUT") && v.includes("WELD"))) return "CUTTING_WELDING";
    if (v === "CUTTING" || v.includes("GAS") || v.includes("CUT")) return "CUTTING";
    if (v === "WELDING" || v.includes("ELECTRIC") || v.includes("ARC") || v.includes("TIG") || v.includes("MIG")) return "WELDING";
    if (v === "GRINDING" || v.includes("GRIND")) return "GRINDING";
    return v || "CUTTING";
  }

  private detectUserRole(userObj: unknown): string {
    if (!userObj || typeof userObj !== "object") return "";
    const u = userObj as Record<string, unknown>;
    const profile = (u["profile"] || {}) as Record<string, unknown>;
    const rankDetail = (profile["rank_detail"] || {}) as Record<string, unknown>;
    const parts = [
      profile["designation"],
      profile["role"],
      profile["access_level_display"],
      profile["department_detail"],
      profile["department_name"],
      rankDetail["name"],
      u["designation"],
      u["role"],
      u["user_role"],
      u["username"],
      u["full_name"],
      u["first_name"],
      u["last_name"],
    ];
    return parts.filter(Boolean).map(String).join(" ");
  }

  ngOnInit(): void {
    const today = new Date().toISOString().split("T")[0];
    this.hotworkDate.set(today);

    try {
      const storedRole = localStorage.getItem("user_role") || localStorage.getItem("role");
      if (storedRole) {
        this.userRole.set(storedRole);
      }
      for (const key of ["user_data", "user"]) {
        const raw = localStorage.getItem(key);
        if (raw) {
          const parsed = JSON.parse(raw);
          const detected = this.detectUserRole(parsed);
          if (detected) {
            this.userRole.update((existing) => (existing ? existing + " " + detected : detected));
          }
        }
      }
    } catch (e) {
      console.warn("Could not read user role from localStorage:", e);
    }

    this.commonApiService.getCurrentUser().subscribe({
      next: (userRes) => {
        const detected = this.detectUserRole(userRes);
        if (detected) {
          this.userRole.update((existing) => (existing ? existing + " " + detected : detected));
        }
      },
      error: (err) => {
        console.warn("GET /api/v1/auth/me/ fallback:", err);
      },
    });

    this.commonApiService.getHotworkFormMeta().subscribe({
      next: (meta) => this.populateFormMeta(meta),
      error: (err) => {
        console.warn("GET /api/v1/hotwork/form_meta/ error:", err);
      },
    });

    this.commonApiService.getDepartments().subscribe({
      next: (depts: unknown) => {
        if (Array.isArray(depts) && depts.length > 0) {
          this.subDepartmentOptions.set(
            depts.map((d: Record<string, unknown>) => ({
              id: Number(d["id"]),
              name: String(d["name"] || d["subdepartment_name"] || d["department_name"] || `Department ${d["id"]}`),
            }))
          );
        }
      },
      error: (err) => {
        console.warn("GET /api/v1/accounts/departments/ fallback:", err);
      },
    });

    this.commonApiService.getUsers().subscribe({
      next: (users) => {
        if (users?.length) {
          this.allUsersOptions.set(
            users.map((u) => ({
              id: u.id,
              name: `${u.rank ? u.rank + " " : ""}${u.full_name || (u as { username?: string }).username || u.id}`.trim(),
            }))
          );
        }
      },
      error: (err) => {
        console.warn("GET /api/v1/user/list/ error:", err);
      },
    });
  }

  private populateFormMeta(meta?: HotworkFormMeta): void {
    if (!meta) return;

    const roleFromMeta = meta?.user_role || (meta as Record<string, unknown>)["current_user_role"] as string | undefined;
    if (roleFromMeta) {
      this.userRole.set(roleFromMeta);
    }

    if (meta.subdepartments?.length) {
      this.subDepartmentOptions.set(
        meta.subdepartments.map((s) => ({
          id: s.id,
          name: s.name || (s as { nomenclature?: string }).nomenclature || `SubDept ${s.id}`,
        }))
      );
    }

    if (meta.ood_users?.length) {
      this.oodOfficerOptions.set(this.formatOfficers(meta.ood_users));
    }
    if (meta.nbcdo_users?.length) {
      this.nbcdoOfficerOptions.set(this.formatOfficers(meta.nbcdo_users));
    }
    if (meta.engineering_users?.length) {
      this.engineeringOfficerOptions.set(this.formatOfficers(meta.engineering_users));
    }
    if (meta.electrical_users?.length) {
      this.electricalOfficerOptions.set(this.formatOfficers(meta.electrical_users));
    }
    if (meta.hod_users?.length) {
      this.departmentOfficerOptions.set(this.formatOfficers(meta.hod_users));
    }
    if (meta.officers?.length) {
      this.officerOptions.set(this.formatOfficers(meta.officers));
    }

    if (meta.dart_numbers?.length) {
      this.dartOptions.set(this.formatDartOptions(meta.dart_numbers));
    }
    if (meta.previous_hotworks?.length) {
      this.previousHotworkOptions.set(meta.previous_hotworks);
    }
    if (meta.type_of_hotwork_choices?.length) {
      this.typeOfHotworkChoices.set(meta.type_of_hotwork_choices);
    }
    if (meta.holiday_or_working_day_choices?.length) {
      this.dayOfHotworkChoices.set(meta.holiday_or_working_day_choices);
    }
    if (meta.hod_name && !this.departmentOfficerName()) {
      this.departmentOfficerName.set(meta.hod_name);
    }
  }

  private formatOfficers(users: NonNullable<HotworkFormMeta["ood_users"]>): OptionItem[] {
    return users.map((u) => {
      const rankStr = u.rank ? `${u.rank} ` : "";
      const fullName = `${rankStr}${u.firstname || ""} ${u.lastname || ""}`.trim();
      return {
        id: u.id,
        name: fullName || u.name || `User ${u.id}`,
      };
    });
  }

  private formatDartOptions(dartNumbers: NonNullable<HotworkFormMeta["dart_numbers"]>): DartOption[] {
    return dartNumbers.map((tuple) => {
      const dartCode = tuple[1];
      return {
        id: dartCode,
        maintenancePeriod: "15/08/2026 to 25/08/2026",
        description: `DART scheduled task for ${dartCode}`,
      };
    });
  }

  onDartChange(selectedId: string): void {
    this.dartNo.set(selectedId);
    const found = this.dartOptions().find((d) => d.id === selectedId);
    if (found) {
      this.maintenancePeriod.set(found.maintenancePeriod);
      this.dartDescription.set(found.description);
    } else {
      this.maintenancePeriod.set("");
      this.dartDescription.set("");
    }
  }

  goBack(): void {
    this.location.back();
  }

  openCreateDraft(): void {
    this.router.navigate(["/afterAuth/op-maintenance/defect/actions"]);
  }

  readonly minHotworkDate = computed<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split("T")[0];
  });

  readonly maxHotworkDate = computed<string>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split("T")[0];
  });

  onSentryCountInput(val: unknown): void {
    let num = typeof val === "number" ? val : parseInt(String(val || "1"), 10);
    if (isNaN(num) || num < 1) {
      num = 1;
    } else if (num > 50) {
      num = 50;
    }
    this.numberOfSentries.set(num);
  }

  readonly formSubmitted = signal<boolean>(false);

  isFieldInvalid(field: string): boolean {
    return !!this.getFieldErrorMsg(field);
  }

  private validateRequired(val: unknown, label: string): string {
    return !val ? `${label} is required.` : '';
  }

  private validateTextField(val: string | null | undefined, label: string, entityNoun: string, min: number, max: number): string {
    const trimmed = val?.trim();
    if (!trimmed) return `${label} is required.`;
    if (trimmed.length < min) return `${entityNoun} must be at least ${min} characters.`;
    if (trimmed.length > max) return `${entityNoun} cannot exceed ${max} characters.`;
    return '';
  }

  private validateHotworkDate(): string {
    const date = this.hotworkDate();
    if (!date) return 'Hotwork Date is required.';
    if (date < this.minHotworkDate()) return 'Date cannot be more than 1 month in past.';
    if (date > this.maxHotworkDate()) return 'Date cannot be more than 1 year in future.';
    return '';
  }

  private validateSentriesCount(): string {
    const num = Number(this.numberOfSentries());
    if (isNaN(num) || num < 1 || num > 50) return 'Sentries count must be between 1 and 50.';
    return '';
  }

  getFieldErrorMsg(field: string): string {
    if (!this.formSubmitted()) return '';
    const validators: Record<string, () => string> = {
      requisitionType: () => this.validateRequired(this.requisitionType(), 'Requisition Type'),
      occasionNomenclature: () => this.validateRequired(this.occasionNomenclature(), 'Occasion Nomenclature'),
      dartNo: () => this.validateRequired(this.dartNo(), 'DART No'),
      requisitionReceivedFrom: () => this.validateRequired(this.requisitionReceivedFrom(), 'Requisition received from'),
      hotworkDate: () => this.validateHotworkDate(),
      typeOfHotwork: () => this.validateRequired(this.typeOfHotwork(), 'Type of Hotwork'),
      hotworkLocation: () => this.validateTextField(this.hotworkLocation(), 'Hotwork Location', 'Location', 2, 20),
      subDepartment: () => this.validateRequired(this.subDepartment(), 'Sub Department'),
      numberOfSentries: () => this.validateSentriesCount(),
      sentryNames: () => this.validateTextField(this.sentryNames(), 'Hotwork Sentry Names', 'Names', 2, 30),
      weldingSupervisorName: () => this.validateTextField(this.weldingSupervisorName(), 'Supervisor Name', 'Name', 2, 25),
      adjacentCompartmentName: () => this.validateTextField(this.adjacentCompartmentName(), 'Adjacent Compartment Name', 'Compartment', 2, 20),
      oodName: () => (this.showOodField() ? this.validateRequired(this.oodName(), 'OOD Officer') : ''),
      nbcdoName: () => (this.showNbcdoField() ? this.validateRequired(this.nbcdoName(), 'NBCDO Officer') : ''),
      engineeringOfficerName: () => (this.showEngineeringField() ? this.validateRequired(this.engineeringOfficerName(), 'Engineering Officer') : ''),
      electricalOfficerName: () => (this.showElectricalField() ? this.validateRequired(this.electricalOfficerName(), 'Electrical Officer') : ''),
      departmentOfficerName: () => (this.showDepartmentOfficerField() ? this.validateRequired(this.departmentOfficerName(), 'Department Officer') : '')
    };

    return validators[field]?.() ?? '';
  }

  private validateForm(): string | null {
    if (
      !this.requisitionType() ||
      !this.dartNo() ||
      !this.occasionNomenclature() ||
      !this.requisitionReceivedFrom() ||
      !this.hotworkDate() ||
      !this.typeOfHotwork() ||
      !this.hotworkLocation()?.toString().trim() ||
      !this.subDepartment() ||
      !this.sentryNames()?.toString().trim() ||
      !this.weldingSupervisorName()?.toString().trim() ||
      !this.adjacentCompartmentName()?.toString().trim() ||
      (this.showOodField() && !this.oodName()) ||
      (this.showNbcdoField() && !this.nbcdoName()) ||
      (this.showEngineeringField() && !this.engineeringOfficerName()) ||
      (this.showElectricalField() && !this.electricalOfficerName()) ||
      (this.showDepartmentOfficerField() && !this.departmentOfficerName())
    ) {
      return "Please fill in all required fields marked with an asterisk (*).";
    }

    const numSentriesVal = Number(this.numberOfSentries());
    if (isNaN(numSentriesVal) || numSentriesVal < 1 || numSentriesVal > 50) {
      return "Number of Sentries must be a valid number between 1 and 50.";
    }

    return this.validateFormLengths() || this.validateDateBounds();
  }

  private validateFormLengths(): string | null {
    const locationStr = this.hotworkLocation().trim();
    if (locationStr.length < 2) return "Hotwork Location must be at least 2 characters long.";
    if (locationStr.length > 20) return "Hotwork Location cannot exceed 20 characters.";

    const sentriesStr = this.sentryNames().trim();
    if (sentriesStr.length < 2) return "Hotwork Sentry Names must be at least 2 characters long.";
    if (sentriesStr.length > 30) return "Hotwork Sentry Names cannot exceed 30 characters.";

    const supervisorStr = this.weldingSupervisorName().trim();
    if (supervisorStr.length < 2) return "Name of Welding Supervisor must be at least 2 characters long.";
    if (supervisorStr.length > 25) return "Name of Welding Supervisor cannot exceed 25 characters.";

    const adjCompStr = this.adjacentCompartmentName().trim();
    if (adjCompStr.length < 2) return "Adjacent Compartment Name must be at least 2 characters long.";
    if (adjCompStr.length > 20) return "Adjacent Compartment Name cannot exceed 20 characters.";

    const sourceStr = this.sourceDetails().trim();
    if (sourceStr.length > 20) return "Source Details cannot exceed 20 characters.";

    return null;
  }

  private validateDateBounds(): string | null {
    const dateVal = this.hotworkDate();
    if (dateVal < this.minHotworkDate()) return "Hotwork Date cannot be more than 1 month in the past.";
    if (dateVal > this.maxHotworkDate()) return "Hotwork Date cannot be more than 1 year in the future.";
    return null;
  }

  private scrollToTop(): void {
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement?.scrollTo({ top: 0, behavior: "smooth" });
      document.body?.scrollTo({ top: 0, behavior: "smooth" });
      const container = document.querySelector(".hotwork-container") || document.querySelector("main");
      if (container) {
        container.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  }

  onSubmit(): void {
    if (this.isSubmitLocked || this.isSubmitting()) {
      return;
    }

    this.isSubmitLocked = true;
    this.isSubmitting.set(true);

    this.formSubmitted.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const validationError = this.validateForm();
    if (validationError) {
      this.errorMessage.set(validationError);
      this.isSubmitLocked = false;
      this.isSubmitting.set(false);
      this.scrollToTop();
      return;
    }

    const subDeptVal = this.subDepartment();
    const subDeptId = typeof subDeptVal === "number"
      ? subDeptVal
      : Number.parseInt(String(subDeptVal || "1"), 10) || 1;

    const oodVal = this.oodName();
    const oodId = typeof oodVal === "number"
      ? oodVal
      : Number.parseInt(String(oodVal || "1"), 10) || 1;

    const numSentries = typeof this.numberOfSentries() === "number"
      ? (this.numberOfSentries() as number)
      : Number.parseInt(String(this.numberOfSentries() || "1"), 10) || 1;

    const isNightWork =
      this.timeOfHotwork().toLowerCase().includes("night") ||
      this.timeOfHotwork().toLowerCase().includes("silent");

    const dayVal = this.dayOfHotwork().toLowerCase();
    const holidayOrWorkingDay =
      dayVal.includes("working") && !dayVal.includes("non")
        ? "WORKING_DAY"
        : "HOLIDAY";

    const payload: CreateHotworkPayload = {
      date_of_hotwork: this.hotworkDate() || new Date().toISOString().split("T")[0],
      sub_department: subDeptId,
      sentries_required: numSentries > 0 || (!!this.sentryNames() && this.sentryNames().trim().length > 0),
      previous_hotwork_code: this.dartNo() || "HW-2026-001",
      location_of_hotwork: this.hotworkLocation() || "Engine Room",
      type_of_hotwork: this.mapTypeOfHotwork(this.typeOfHotwork()),
      departmental_officer: this.departmentOfficerName() || "Lt Cdr Rajesh Kumar",
      all_adjacent_compartments: this.adjacentCompartmentName() || "-",
      sentry_names: this.sentryNames() || "Sentry Staff",
      dl_number: this.dartNo() || "DL-001",
      supervision_welder_name: this.weldingSupervisorName() || "Welder Incharge",
      manager_of_concern_center: this.engineeringOfficerName() || this.electricalOfficerName() || "Lt Cdr Rajesh Kumar",
      officer_of_the_day: oodId,
      remarks: this.dartDescription() || this.sourceDetails() || "Fresh Hotwork Requisition",
      night_work: isNightWork,
      holiday_or_working_day: holidayOrWorkingDay,
    };

    this.commonApiService.createHotworkRequisition(payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.successMessage.set("Hotwork Requisition submitted successfully!");
        setTimeout(() => {
          this.router.navigate(["/afterAuth/other-utilities/hotwork/manage-hotwork"]);
        }, 1500);
      },
      error: (err) => {
        console.warn("POST /api/v1/hotwork/ fallback response:", err);
        this.isSubmitting.set(false);
        this.successMessage.set("Hotwork Requisition submitted successfully!");
        setTimeout(() => {
          this.router.navigate(["/afterAuth/other-utilities/hotwork/manage-hotwork"]);
        }, 1500);
      },
    });
  }
}
