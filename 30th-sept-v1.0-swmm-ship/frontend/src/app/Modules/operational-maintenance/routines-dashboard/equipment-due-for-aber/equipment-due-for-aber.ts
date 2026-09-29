import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from "@angular/common";
import { Component, inject, OnInit, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { Subject, debounceTime } from "rxjs";
import { MasterCard } from "../../../refit-maintenance/master-card/master-card";
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";
import { DataGrid } from "../../../../shared/components/data-grid/data-grid";
import { SelectInput } from "../../../../shared/components/select-input/select-input";
import {
  EquipmentDueForAber,
  EquipmentDueForAberResponse,
} from "./equipment-due-for-aber.model";
import { RaiseAberRenderer } from "../../action-forms/raise-aber-renderer/raise-aber-renderer";
import { StatusRenderer } from "../../action-forms/status-renderer";
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { ExportKind, ExportToolbar } from "../../../../shared/components/export-toolbar/export-toolbar";
import { Router } from '@angular/router';
import { PrintColumn, ReportExportService } from "../../../../Core/services/export/generic-export.service";

@Component({
  selector: "app-equipment-due-for-aber",
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MasterCard, DataGrid, SelectInput, IconComponent, ExportToolbar, ButtonComponent],
  templateUrl: "./equipment-due-for-aber.html",
  styleUrl: "./equipment-due-for-aber.css",
})
export class EquipmentDueForABER implements OnInit {
  private route = inject(Router)
  private api = inject(OperationalMaintenanceApi);
  private toastr = inject(NotificationService);
  private fb = inject(FormBuilder);
  private exportService = inject(ReportExportService);
  readonly exportBusy = signal<ExportKind | null>(null);
  readonly isLoading = signal(false);

  filteredMaintopRoutines = signal<EquipmentDueForAber[]>([]);
  nomenclatureOptions: { label: string; value: string }[] = [];
  compartmentOptions: { label: string; value: string }[] = [];

  searchText = "";

  equipment_due_for_aber_form = this.fb.group({
    nomenclature: [""],
    compartment: [""],
  });

  private readonly filtersChanged = new Subject<void>();

  ngOnInit(): void {
    this.loadAberData();

    // Backend does the filtering — debounce so typing/dropdown changes don't
    // fire a request per keystroke/click.
    this.filtersChanged.pipe(debounceTime(300)).subscribe(() => {
      this.loadAberData();
    });

    this.equipment_due_for_aber_form.valueChanges.subscribe(() => {
      this.filtersChanged.next();
    });
  }

  loadAberData(): void {
    const { nomenclature, compartment } =
      this.equipment_due_for_aber_form.getRawValue();

    this.isLoading.set(true);
    this.api
      .getABERTriggerRoutinesData({
        nomenclature: nomenclature || undefined,
        compartment: compartment || undefined,
        search: this.searchText.trim() || undefined,
      })
      .subscribe({
        next: (res: EquipmentDueForAberResponse) => {
          this.filteredMaintopRoutines.set(res.result || [])

          this.nomenclatureOptions = (res.nomenclatures || [])
            .filter((item) => item !== "")
            .map((item) => ({
              label: item,
              value: item,
            }));

          this.compartmentOptions = (res.compartments || [])
            .filter((item) => item !== "")
            .map((item) => ({
              label: item,
              value: item,
            }));
        },
        error: (err) => {
          console.error(err);
          this.toastr.error("Failed to load ABER data");
          this.isLoading.set(false);
        },
        complete: () => {
          this.isLoading.set(false);
        },
      });
  }

  onSearch(event: Event): void {
    this.searchText = (event.target as HTMLInputElement).value;
    this.filtersChanged.next();
  }

  clearFilters(): void {
    this.searchText = "";

    this.equipment_due_for_aber_form.reset({
      nomenclature: "",
      compartment: "",
    });

    this.loadAberData();
  }

  defectColumnDefs = [
    {
      headerName: "INSMA Equipment Code",
      field: "insma_code",
      flex: 1,
    },
    {
      headerName: "Equipment Nomenclature",
      field: "nomenclature",
      flex: 2,
    },
    {
      headerName: "Compartment Name",
      field: "compartment",
      flex: 1.2,
    },
    {
      headerName: "Date of Installation",
      field: "installation_date",
      flex: 1.5,
    },
    {
      headerName: "Years since Installation",
      field: "years_since",
      flex: 1,
    },
    {
      headerName: "Status",
      field: "status",
      flex: 1,
      cellRenderer: StatusRenderer,
    },
    {
      headerName: "Actions",
      field: "actions",
      pinned: "right",
      cellRenderer: RaiseAberRenderer,
      cellRendererParams: {
        buttonLabel: "Raise ABER",
        onClick: (data: EquipmentDueForAber) => this.raiseAber(data),
      },
      width: 180,
    },
  ];
  raiseAber(data: EquipmentDueForAber): void {
    this.toastr.info(
      `Raising ABER for equipment ID: ${data.pk} (Functionality to be implemented)`
    );
  }

  private get printColumns(): PrintColumn[] {
    return this.defectColumnDefs
      .filter((c) => !!c.field && c.field !== "actions")
      .map((c) => ({ header: String(c.headerName ?? c.field), field: c.field }));
  }

  onExport(kind: ExportKind): void {
    const rows = this.filteredMaintopRoutines() as unknown as Record<string, unknown>[];
    if (kind === "excel") {
      this.exportService.downloadCsv(this.printColumns, rows, "equipment-due-for-aber.csv");
      return;
    }
    this.exportService.printRows("Equipment Due for ABER", this.printColumns, rows);
  }
   goBackToList(){
    this.route.navigateByUrl('afterAuth/op-maintenance/routine/dashboard')
  }
}
