import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, EventEmitter, OnInit, Output, signal, inject } from "@angular/core";
import {
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { CommonModule } from "@angular/common";
import {
  FormField,
  GUARANTEE_DEFECT_FIELDS,
} from "./guarantee-defect-form-config";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import { InputField } from "../../../../shared/components/input-field/input-field";
import { RadioInput } from "../../../../shared/components/radio-input/radio-input";
import { DefectService } from "../defact-form/defect-service";
import { Router } from "@angular/router";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { firstValueFrom } from "rxjs";
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { AppService } from "../../../../Core/services/app/app.service";
import { ConfirmModalData, MasterEquipmentItem } from "../action-forms.model";
import { HttpErrorResponse } from "@angular/common/http";

interface MasterDataResponse {
  equipment_list?: MasterEquipmentItem[];
}

interface EquipmentObjectsResponse {
  ship_equipments?: { id: string | number; nomenclature: string }[];
}

interface NomenclatureDetailsResponse {
  equipment_serial_no?: string;
  location_on_board?: string;
}

interface CreateGuaranteeDefectResponse {
  status?: number;
  body?: {
    message?: string;
    messages?: string;
  };
}

interface ApiErrorResponse extends Partial<HttpErrorResponse> {
  error?: {
    message?: string;
    messages?: string;
    [key: string]: unknown;
  };
}
@Component({
  selector: "app-guarantee-defect-form",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectInput,
    InputField,
    RadioInput
  , ButtonComponent],
  templateUrl: "./guarantee-defect-form.html",
  styleUrl: "./guarantee-defect-form.css",
})
export class GuaranteeDefectForm implements OnInit {
  private fb = inject(FormBuilder);
  private defectService = inject(DefectService);
  private router = inject(Router);
  private calls = inject(OperationalMaintenanceApi);
  private toast = inject(NotificationService);
  private appService = inject(AppService);
  private opMaintenance = inject(OperationalMaintenanceApi);

  fields = signal<FormField[]>(GUARANTEE_DEFECT_FIELDS);
  loading = signal(false);
  masterEquipmentList: MasterEquipmentItem[] = [];
  @Output() openConfirm = new EventEmitter<void>();
  @Output() cancelForm = new EventEmitter<void>();

  // en-CA formats as yyyy-mm-dd in the LOCAL timezone — toISOString() would convert to
  // UTC first, which in a UTC+ zone rolls back to yesterday's date after midnight-ish hours.
  maxDefectDate = new Date().toLocaleDateString("en-CA");

  onCancel(): void {
    this.cancelForm.emit();
  }

  form!: FormGroup;

  constructor() {
    const controls: Record<string, FormControl> = {};

    this.fields().forEach((field) => {
      controls[field.key] = new FormControl(
        {
          value: field.defaultValue ?? null,
          disabled: field.readonly ?? false,
        },
        field.validators || [],
      );
    });

    this.form = this.fb.group(controls);
    this.setupDependencies();
  }

  async ngOnInit() {
    await this.loadMasterData();

    this.listenEquipmentChange();

    this.listenNomenclatureChange();
    this.listenRepairSlipAvailabilityChange();
  }

  // Open confirmation modal on save
  openConfirmModal() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.openConfirm.emit();
  }

  async loadMasterData() {
    const departmentId = (await this.opMaintenance.getCurrentDepartmentId()) ?? 1;
    const data = await this.defectService.getMasterData(departmentId) as MasterDataResponse;

    this.masterEquipmentList = data.equipment_list ?? [];

    this.fields.update((fields) =>
      fields.map((field) => {
        switch (field.key) {
          case "equipmentName":
            return {
              ...field,
              options: (data.equipment_list ?? [])
                .filter((item) => (item.equipment_name ?? '') !== '')
                .map((item) => ({
                  label: item.equipment_name ?? '',
                  value: item.id ?? '',
                })),
            };

          case "equipmentNomenclature":
            return {
              ...field,
              options: [],
            };

          // case "repairSlipAvailability":
          //   return {
          //     ...field,
          //     options: data.refit_periods?.map((item: any) => ({
          //       label: "test",
          //       value: "test",
          //     })),
          //   };

          default:
            return field;
        }
      }),
    );
  }

  private toNomenclatureOptions(shipEquipments: EquipmentObjectsResponse['ship_equipments']) {
    return (shipEquipments ?? [])
      .filter((item) => item.nomenclature !== '')
      .map((item) => ({ label: item.nomenclature, value: item.id }));
  }

  private listenEquipmentChange() {
    this.form
      .get("equipmentName")
      ?.valueChanges.subscribe(async (equipmentId) => {
        this.form.patchValue({
          equipmentNomenclature: null,
        });

        const equipment = this.masterEquipmentList.find(
          (e: MasterEquipmentItem) => e.id === equipmentId,
        );

        if (!equipment) {
          return;
        }

        const response = await this.defectService.getEquipmentObjects(
          equipment.equipment_code ?? '',
        ) as EquipmentObjectsResponse;

        this.fields.update((fields) =>
          fields.map((field) => {
            if (field.key !== "equipmentNomenclature") {
              return field;
            }

            return {
              ...field,
              options: this.toNomenclatureOptions(response.ship_equipments),
            };
          }),
        );
      });
  }

  private listenNomenclatureChange() {
    this.form
      .get("equipmentNomenclature")
      ?.valueChanges.subscribe(async (nomenclatureId) => {
        if (!nomenclatureId) {
          this.form.patchValue({
            equipmentSerialNo: null,
            onBoardLocation: null,
          });

          return;
        }

        const response =
          await this.defectService.getNomenclatureDetails(nomenclatureId) as NomenclatureDetailsResponse;

        this.form.patchValue({
          equipmentSerialNo: response.equipment_serial_no,
          onBoardLocation: response.location_on_board,
        });
      });
  }

  private listenRepairSlipAvailabilityChange() {
    this.form
      .get('repairSlipAvailability')
      ?.valueChanges.subscribe((value) => {
        if (!value) {
          this.form.patchValue({
            repairDate: null,
          });
        }
      });
  }

  isFieldVisible(field: FormField): boolean {
    if (!field.showWhen) {
      return true;
    }

    return (
      this.form.get(field.showWhen.field)?.value ===
      field.showWhen.value
    );
  }

  isFieldRequired(field: FormField): boolean {
    return !!field.validators?.includes(Validators.required);
  }

  private setupDependencies(): void {
    this.fields().forEach((field) => {
      if (!field.resetOnChange?.length) {
        return;
      }

      this.form.get(field.key)?.valueChanges.subscribe(() => {
        field.resetOnChange?.forEach((controlName) => {
          this.form.get(controlName)?.reset();
        });
      });
    });
  }

  async submit(modalData: ConfirmModalData) {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rawData = {
      ...this.form.getRawValue(),
      ...modalData,
    };

    const formData = new FormData();

    formData.append("dart_type", "Guarantee Defect");


    formData.append(
      "equipmentName",
      String(rawData.equipmentName)
    );
    formData.append(
      "g_nomenclature",
      String(rawData.equipmentNomenclature)
    );
    formData.append(
      "equipmentSerialNo",
      String(rawData.equipmentSerialNo)
    );
    formData.append(
      "onBoardLocation",
      String(rawData.onBoardLocation)
    );

    formData.append(
      "g_defectDate",
      rawData.defectDate || ""
    );

    formData.append(
      "g_defect_description",
      rawData.defectDescription || ""
    );

    formData.append(
      "g_cause",
      rawData.causeOfDefect || ""
    );

    formData.append(
      "opAvailability",
      rawData.affectsOperationalAvailability ? "YES" : "NO"
    );


    formData.append(
      "hotWork",
      String(rawData.hotWorkInvolved ? "YES" : "NO")
    );


    formData.append(
      "g_repairs",
      String(rawData.repairSlipAvailability ? "1" : "0")
    );



    formData.append(
      "g_completionDate",
      String(rawData.completionDate)
    );


    formData.append(
      "g_repairDate",
      String(rawData.repairDate)
    );


    formData.append(
      "g_place",
      String(rawData.repairPlace)
    );


    formData.append(
      "maintenance_period",
      rawData.dartForMaintenance || ""
    );

    formData.append(
      "dart_occasion",
      rawData.dartOccasion || ""
    );

    formData.append(
      "ops_period_id",
      rawData.existingRefit || ""
    );

    formData.append(
      "start_date",
      rawData.startDate || ""
    );

    formData.append(
      "end_date",
      rawData.endDate || ""
    );



    try {

     this.appService.showLoader()
      const response = await firstValueFrom(
        this.calls.createGuaranteeDefect(formData)
      ) as CreateGuaranteeDefectResponse;

      if (response.status === 201) {

        this.toast.success(
          response.body?.message ||
          response.body?.messages ||
          'Guarantee defect saved successfully'
        );
        this.router.navigateByUrl("/afterAuth/op-maintenance/defect/actions", {
          replaceUrl: true,
        });

      }
    } catch (err: unknown) {
      const error = err as ApiErrorResponse;
      const errorMessage =
        error?.error?.message ||
        error?.error?.messages ||
        error?.message ||
        'Something went wrong';

      this.toast.error(errorMessage);
      console.error('Create Guarantee Defect Error:', error);
    }
    finally {
      this.appService.hideLoader()
    }

  }



  getError(fieldName: string): string {
    const control = this.form.get(fieldName);

    if (!control?.touched) return "";

    if (control.hasError("required")) {
      return "This field is required";
    }

    if (control.hasError("dateInFuture")) {
      return "Defect Date cannot be a future date";
    }

    return "";
  }
}
