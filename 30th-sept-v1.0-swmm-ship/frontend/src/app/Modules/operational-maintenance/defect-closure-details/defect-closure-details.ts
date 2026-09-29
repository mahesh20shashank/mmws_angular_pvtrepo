import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { HttpErrorResponse } from "@angular/common/http";
import { Component, inject, OnInit, signal } from "@angular/core";
import { MasterCard } from "../../refit-maintenance/master-card/master-card";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import { SelectInput } from "../../../shared/components/select-input/select-input";
import { InputField } from "../../../shared/components/input-field/input-field";
import { OperationalMaintenanceApi } from "../services/operational-maintenance-api";
import { ActivatedRoute, Router } from "@angular/router";
import { CloseDefectResponse, IssuedSpare } from "./defect-closure-details.model";
import { RowData } from "ag-grid-community";
import { GridTextCell } from "../../../shared/components/data-grid/grid-text-cell";
import { SpareDeleteRenderer } from "../../../shared/components/data-grid/spare-delete-renderer";
import { FileInput } from "../../../shared/components/file-input/file-input";
import { ImagePreview } from "../../../shared/components/image-preview/image-preview";
import { AppService } from "../../../Core/services/app/app.service";
import { NotificationService } from '../../../Core/services/notification/notification.service';
import { firstValueFrom } from "rxjs";

@Component({
  selector: "app-defect-closure-details",
  standalone: true,
  imports: [CommonModule, MasterCard, DataGrid, ReactiveFormsModule, SelectInput, InputField, FileInput, ImagePreview, ButtonComponent],
  templateUrl: "./defect-closure-details.html",
  styleUrl: "./defect-closure-details.css",
})
export class DefectClosureDetails implements OnInit {
  private api = inject(OperationalMaintenanceApi);
  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private appService = inject(AppService);
  private toastr = inject(NotificationService);
  submitted = false;

  previewImages: string[] = [];
  showImagePreview = false;
  closeForm!: FormGroup;
  repairAgencyOptions: { label: string; value: number }[] = [];
  diagnosticOptions: { label: string; value: number }[] = [];
  sparesData: IssuedSpare[] = [];
  readonly isLoading = signal(false);

  defectId!: number;
  maxRectifiedDate = new Date().toISOString().slice(0, 10);

  private static notFutureDate(control: AbstractControl): ValidationErrors | null {
    if (!control.value) {
      return null;
    }

    const today = new Date().toISOString().slice(0, 10);

    return control.value > today ? { futureDate: true } : null;
  }

  ngOnInit(): void {
    this.initializeForm();

    const paramId = Number(this.route.snapshot.paramMap.get("id"));
    const stateId = history.state?.dartId ? Number(history.state.dartId) : null;
    this.defectId = paramId || stateId || 0;

    if (this.defectId) {
      void this.getDefectDetails();
    } else {
      console.error('No defectId found - check console above');
    }
  }
  addSpare() {
    this.sparesData = [
      ...this.sparesData,
      {
        spare_pattern_number: "",
        spare_description: "",
        quantity_issued: 1,
        date_of_issue: "",
      },
    ];
  }
  openPreview(images: string[]) {
    this.previewImages = images;
    this.showImagePreview = true;
  }

  closePreview() {
    this.showImagePreview = false;
  }

  initializeForm() {
    this.closeForm = this.fb.group({
      rectified_date: ["", [Validators.required, DefectClosureDetails.notFutureDate]],
      repair_agency_code: ["", Validators.required],
      diagnostic_code: [""],
      lesson_learnt: ["", Validators.required],

      days_delay: [0],
      delay_in_closing: [0],
      defect_report: [null],
      equipment_name: [""],
      nomenclature: [""],
      dart_number: [""],
      defect_date: [""],
      defect_closing_date: [""],
      scheduled_date: [""],
      defect_description: [""],
    });
  }
  goBack(): void {
    this.router.navigate(["/afterAuth/op-maintenance/defect/actions"]);
  }
  async getDefectDetails(): Promise<void> {
    this.isLoading.set(true);
    try {
      const response: CloseDefectResponse = await firstValueFrom(this.api.getCloseDefectById(this.defectId));
      const defect = response.data.defect;

      this.closeForm.patchValue({
        // Read Only Section — the API returns these already resolved on `defect`
        dart_number: defect?.dart_number || "",
        equipment_name: defect?.equipment_name || "",
        nomenclature: defect?.nomenclature || "",
        defect_date: defect?.defect_date || "",
        defect_closing_date: defect?.defect_closing_date || "",
        scheduled_date: defect?.scheduled_date || "",
        defect_description: defect?.defective_discriptions || "",
      });

      // Re-opening an already-closed defect (e.g. from History) — prefill the editable
      // fields from its previously-saved closure instead of leaving them blank.
      const closure = response.data.closure;
      if (closure) {
        this.closeForm.patchValue({
          rectified_date: closure.rectified_date || "",
          repair_agency_code: closure.repair_agency_code || "",
          diagnostic_code: closure.diagnostic_code || "",
          days_delay: closure.days_delay || 0,
          delay_in_closing: closure.days_delay || 0,
          lesson_learnt: closure.lesson_learnt || "",
        });
      }

      this.sparesData =
        response.data.issued_spare_obj?.length > 0
          ? response.data.issued_spare_obj
          : [];

      // Repair Agency Dropdown
      this.repairAgencyOptions = response.data.repair_agency_list.map((item) => ({
        label: `${item.repair_agency_code} - ${item.repair_agency_name}`,
        value: item.id,
      }));

      // Diagnostic Dropdown
      this.diagnosticOptions = response.data.diagnostic_list.map((item) => ({
        label: `${item.diagnostic_code} - ${item.diagnostic_name}`,
        value: item.id,
      }));
    } catch (err) {
      console.error(err);
    } finally {
      this.isLoading.set(false);
    }
  }

  onCellValueChange(row: RowData, field: string, value: unknown) {
    const index = this.sparesData.findIndex((item) => item === row);

    if (index !== -1) {
      (this.sparesData[index] as unknown as Record<string, unknown>)[field] = value;

      // trigger change detection
      this.sparesData = [...this.sparesData];
    }
  }

  sparesColumnDefs = [
    {
      headerName: "Pattern Number / OEM Part No",
      field: "spare_pattern_number",
      flex: 2,
      cellRenderer: GridTextCell,
      cellRendererParams: {
        field: "spare_pattern_number",
        onValueChange: (row: RowData, field: string, value: unknown) =>
          this.onCellValueChange(row, field, value),
      },
    },
    {
      headerName: "Description",
      field: "spare_description",
      flex: 2,
      cellRenderer: GridTextCell,
      cellRendererParams: {
        field: "spare_description",
        onValueChange: (row: RowData, field: string, value: unknown) =>
          this.onCellValueChange(row, field, value),
      },
    },
    {
      headerName: "Quantity Used",
      field: "quantity_issued",
      cellRenderer: GridTextCell,
      flex: 2,
      cellRendererParams: {
        field: "quantity_issued",
        type: "number",
        onValueChange: (row: RowData, field: string, value: unknown) =>
          this.onCellValueChange(row, field, value),
      },
    },
    {
      headerName: "Action",
      flex: 2,
      sortable: false,
      filter: false,
      cellRenderer: SpareDeleteRenderer,
      cellRendererParams: {
        onDelete: (row: RowData) => this.removeSpare(row),
      },
    },
  ];
  removeSpare(row: RowData) {
    this.sparesData = this.sparesData.filter((spare) => spare !== row);
  }
  async closeDefect() {
    this.submitted = true;
    if (this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();

      this.toastr.warning("Please fill all required fields.", "Validation");

      return;
    }

    this.appService.showLoader();

    const formData = new FormData();

    formData.append(
      "rectified_date",
      this.closeForm.value.rectified_date || "",
    );

    formData.append(
      "repair_agency_code",
      String(this.closeForm.value.repair_agency_code || ""),
    );

    formData.append(
      "diagnostic_code",
      String(this.closeForm.value.diagnostic_code || ""),
    );

    formData.append("days_delay", String(this.closeForm.value.days_delay || 0));

    formData.append("lesson_learnt", this.closeForm.value.lesson_learnt || "");

    formData.append(
      "spares_used",
      JSON.stringify(
        this.sparesData.map((item) => ({
          pattern: item.spare_pattern_number,
          desc: item.spare_description,
          qty: item.quantity_issued,
        })),
      ),
    );

    const file = this.closeForm.get("defect_report")?.value;

    if (file) {
      formData.append("defect_report", file);
    }

    try {
      await firstValueFrom(this.api.updateCloseDefect(this.defectId, formData));
      await this.appService.hideLoader();

      this.toastr.success("Defect closed successfully.", "Success");

      this.router.navigate(["/afterAuth/op-maintenance/defect/history"]);
    } catch (err) {
      await this.appService.hideLoader();

      this.toastr.error(
        ((err as HttpErrorResponse)?.error?.message as string) || "Failed to close defect.",
        "Error",
      );

      console.error(err);
    }
  }
  get f() {
    return this.closeForm.controls;
  }
}
