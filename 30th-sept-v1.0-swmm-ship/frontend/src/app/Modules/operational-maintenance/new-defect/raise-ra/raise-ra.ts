import { Component, ChangeDetectionStrategy, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { ButtonComponent } from "../../../../shared/components/button/button.component";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { InputField } from "../../../../shared/components/input-field/input-field";
import { DropdownOption, SelectInput } from "../../../../shared/components/select-input/select-input";
import { NotificationService } from "../../../../Core/services/notification/notification.service";

type RaType = "Normal" | "OP" | "AMP" | "SMP" | "Signal";

interface RaTypeOption {
  value: RaType;
  label: string;
  description: string;
}

interface SelectedDart {
  id: number;
  dartNo: string;
  equipmentService: string;
  reason: string;
  defectRectified: string;
  status: string;
  date: string;
  severity: string;
  syncedToShore: boolean;
  additionalRemarks: string;
  shipRemarks: string;
}

const RA_TYPE_OPTIONS: RaTypeOption[] = [
  { value: "Normal", label: "Normal RA", description: "Standard operational Required Assistance" },
  { value: "OP", label: "OP RA", description: "Operational RA raised against an OPDEF while deployed" },
  { value: "AMP", label: "AMP", description: "Assisted Maintenance Period RA (HQ-authorised harbour period)" },
  { value: "SMP", label: "SMP", description: "Self Maintenance Period RA" },
  { value: "Signal", label: "Signal RA", description: "RA in signal / letter form — no connectivity" },
];

const YARD_OPTIONS: DropdownOption[] = [
  { label: "NSRY(Pbr)", value: "NSRY(Pbr)" },
  { label: "NSRY(Vizag)", value: "NSRY(Vizag)" },
  { label: "Naval Dockyard (Mumbai)", value: "Naval Dockyard (Mumbai)" },
  { label: "Naval Dockyard (Vizag)", value: "Naval Dockyard (Vizag)" },
  { label: "Mazagon Dock", value: "Mazagon Dock" },
];

const SHIP_REMARKS_OPTIONS: DropdownOption[] = [
  { label: "Nil", value: "Nil" },
  { label: "Awaiting spares", value: "Awaiting spares" },
  { label: "Requires yard assistance", value: "Requires yard assistance" },
  { label: "Under FMU examination", value: "Under FMU examination" },
];

const ROUTING_STEPS = ["Ship Staff", "FMU", "Yard / NavYojana"];

// Static demo row — matches the "Raise RA" mock. Replace with the rows the caller actually
// selected in the Defect / DART List once that selection is threaded through to this page.
const SELECTED_DART_ROWS: SelectedDart[] = [
  {
    id: 1,
    dartNo: "D-L-00139",
    equipmentService: "Sea Viper Director",
    reason: "ABER",
    defectRectified: "No",
    status: "Open",
    date: "18-Jun-26",
    severity: "OPDEF",
    syncedToShore: true,
    additionalRemarks: "",
    shipRemarks: "",
  },
];

/** Route this page is reached at — the Defect / DART List navigates here (see
 *  DefectView.goToRaDraft) and the "Back"/"Cancel" actions return to it. */
const DEFECT_ACTIONS_URL = "/afterAuth/op-maintenance/defect/actions";

/** "Raise RA" page — the Defect / DART List routes here (after DARTs are checked and
 *  "RA Draft" is clicked) to pick the RA type, target yard, and submit. The checked
 *  rows are passed via router navigation `state` (see DefectView.goToRaDraft) and read
 *  back from `history.state` in ngOnInit, since Router.getCurrentNavigation() is only
 *  available during the navigation itself, not once this component has activated. */
@Component({
  selector: "app-raise-ra",
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, IconComponent, InputField, SelectInput],
  templateUrl: "./raise-ra.html",
  styleUrl: "./raise-ra.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RaiseRa implements OnInit {
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);

  readonly raTypeOptions = RA_TYPE_OPTIONS;
  readonly yardOptions = YARD_OPTIONS;
  readonly shipRemarksOptions = SHIP_REMARKS_OPTIONS;
  readonly routingSteps = ROUTING_STEPS;

  readonly raType = signal<RaType>("Normal");
  readonly yardName = signal<string>("NSRY(Pbr)");
  readonly selectedDarts = signal<SelectedDart[]>(SELECTED_DART_ROWS);

  ngOnInit(): void {
    const selectedRows: any[] = history.state?.selectedRows ?? [];
    console.log("Raise RA — received selected DARTs:", selectedRows);

    if (selectedRows.length) {
      this.selectedDarts.set(
        selectedRows.map((row, index) => ({
          id: row.id ?? index,
          dartNo: row.dart_number ?? "-",
          equipmentService: row.equipment_name ?? "-",
          reason: row.reason ?? "-",
          defectRectified: row.defect_rectified ?? "-",
          status: row.status ?? "-",
          date: row.dart_date ?? "-",
          severity: row.severity ?? "-",
          syncedToShore: !!row.cmms_sync_status,
          additionalRemarks: "",
          shipRemarks: "",
        })),
      );
    }
  }

  pickRaType(value: RaType): void {
    this.raType.set(value);
  }

  removeDart(id: number): void {
    this.selectedDarts.update((rows) => rows.filter((row) => row.id !== id));
  }

  updateRemarks(id: number, value: string): void {
    this.selectedDarts.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, additionalRemarks: value } : row)),
    );
  }

  updateShipRemarks(id: number, value: string): void {
    this.selectedDarts.update((rows) =>
      rows.map((row) => (row.id === id ? { ...row, shipRemarks: value } : row)),
    );
  }

  cancel(): void {
    this.router.navigateByUrl(DEFECT_ACTIONS_URL);
  }

  save(): void {
    this.notification.info("RA draft saved");
  }

  submit(): void {
    const missingShipRemarks = this.selectedDarts().some((row) => !row.shipRemarks);
    if (missingShipRemarks) {
      this.notification.error("Ship Remarks is required for every selected DART.");
      return;
    }

    this.notification.success(`RA routed to ${this.yardName()} via Ship Staff → FMU → Yard / NavYojana`);
    this.router.navigateByUrl(DEFECT_ACTIONS_URL);
  }
}
