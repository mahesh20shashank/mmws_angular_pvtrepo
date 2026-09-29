import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { MasterCard } from '../../../refit-maintenance/master-card/master-card';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { computeVolumeAndWeight, OilType, TankRecord, TankType } from '../models/tank-management.model';

const TANK_TYPES: TankType[] = ['AVCAT', 'Fuel', 'Fresh Water', 'Ballast'];
const OIL_TYPES: OilType[] = ['Diesel', 'AVCAT', 'Lube Oil', 'Waste Oil'];

let nextId = 1;

@Component({
  selector: 'app-tank-management',
  standalone: true,
  imports: [CommonModule, MasterCard, ReactiveFormsModule, SelectInput, DataGrid, ButtonComponent],
  templateUrl: './tank-management.html',
  styleUrl: './tank-management.css',
})
export class TankManagement {
  private readonly fb = inject(FormBuilder);
  private readonly toastr = inject(NotificationService);
  private readonly router = inject(Router);

  readonly tankTypeOptions = TANK_TYPES.map((t) => ({ label: t, value: t }));
  readonly oilTypeOptions = OIL_TYPES.map((t) => ({ label: t, value: t }));

  tanks: TankRecord[] = [];
  editingId: number | null = null;
  submitted = false;

  readonly form: FormGroup = this.fb.group({
    tank_type: ['', Validators.required],
    manual_name: ['', Validators.required],
    location: [''],
    oil_type: [''],
    mm_measurement: ['', [Validators.required, Validators.pattern(/^\d+(\.\d+)?$/)]],
    reading_time: [''],
  });

  get result(): { volume: number; weight: number } | null {
    const { tank_type, mm_measurement } = this.form.getRawValue();
    if (!tank_type || !mm_measurement || isNaN(Number(mm_measurement))) {
      return null;
    }
    return computeVolumeAndWeight(tank_type, Number(mm_measurement));
  }

  backToHome(): void {
    this.router.navigate(['/afterAuth/op-maintenance/routine/dashboard']);
  }

  columnDefs: ColDef[] = [
    { headerName: 'ID', field: 'id', width: 70 },
    { headerName: 'Tank Type', field: 'tank_type', flex: 1 },
    { headerName: 'Location', field: 'location', flex: 1.2 },
    { headerName: 'Oil Type', field: 'oil_type', flex: 1 },
    { headerName: 'Manual Name', field: 'manual_name', flex: 1.4 },
    { headerName: 'MM Measurement', field: 'mm_measurement', flex: 1 },
    { headerName: 'Volume (T)', field: 'volume', flex: 1 },
    { headerName: 'Weight (T)', field: 'weight', flex: 1 },
    { headerName: 'Reading Time', field: 'reading_time', flex: 1.2 },
    { headerName: 'Created Date', field: 'created_date', flex: 1 },
    {
      headerName: 'Actions',
      field: 'id',
      flex: 1,
      pinned: 'right',
      cellRenderer: (params: CellCallbackParams) => {
        const rowData = params.data as TankRecord;
        const wrap = document.createElement('div');
        wrap.className = 'flex gap-2';
        const edit = document.createElement('button');
        edit.textContent = 'Edit';
        edit.className = 'text-[#1D96E9] underline text-xs';
        edit.onclick = () => this.startEdit(rowData);
        const del = document.createElement('button');
        del.textContent = 'Delete';
        del.className = 'text-red-400 underline text-xs';
        del.onclick = () => this.delete(rowData.id);
        wrap.appendChild(edit);
        wrap.appendChild(del);
        return wrap;
      },
    },
  ];

  get formTitle(): string {
    return this.editingId ? 'Edit Tank Record' : 'Add New Tank Record';
  }

  startEdit(tank: TankRecord): void {
    this.editingId = tank.id;
    this.form.patchValue({
      tank_type: tank.tank_type,
      manual_name: tank.manual_name,
      location: tank.location,
      oil_type: tank.oil_type,
      mm_measurement: tank.mm_measurement,
      reading_time: tank.reading_time,
    });
  }

  cancelEdit(): void {
    this.editingId = null;
    this.submitted = false;
    this.form.reset();
  }

  delete(id: number): void {
    this.tanks = this.tanks.filter((t) => t.id !== id);
    this.toastr.success('Tank record deleted.');
  }

  save(): void {
    this.submitted = true;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastr.warning('Please fill Tank Type, Tank Name and a valid MM Measurement.');
      return;
    }

    const value = this.form.getRawValue();

    const { volume, weight } = computeVolumeAndWeight(value.tank_type, Number(value.mm_measurement));

    if (this.editingId) {
      this.tanks = this.tanks.map((t) =>
        t.id === this.editingId
          ? { ...t, ...value, mm_measurement: Number(value.mm_measurement), volume, weight }
          : t,
      );
      this.toastr.success('Tank record updated.');
    } else {
      this.tanks = [
        ...this.tanks,
        {
          id: nextId++,
          ...value,
          mm_measurement: Number(value.mm_measurement),
          volume,
          weight,
          created_date: new Date().toISOString().slice(0, 10),
        },
      ];
      this.toastr.success('Tank record added.');
    }

    this.cancelEdit();
  }
}
