import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, EventEmitter, input, OnInit, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import { SelectInput } from '../../../../shared/components/select-input/select-input';
import { OperationalMaintenanceApi } from '../../services/operational-maintenance-api';
import { DataGrid } from '../../../../shared/components/data-grid/data-grid';
import { ColDef, ICellRendererParams, CellCallbackParams } from "ag-grid-community";
import { firstValueFrom } from 'rxjs';
import { DefectService } from '../defact-form/defect-service';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { SpareItem, ConfirmModalData, MasterEquipmentItem, SelectOption } from '../action-forms.model';
import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

interface MasterDataResponse {
  next_suggested_dart_no?: string;
  previous_dart_no?: string;
  equipment_list?: MasterEquipmentItem[];
}

interface EquipmentObjectsResponse {
  ship_equipments?: { id: string | number; nomenclature: string }[];
}

interface NomenclatureDetailsResponse {
  location_on_board?: string;
}

interface SaveAberResponse {
  message?: string;
}

@Component({
  selector: 'app-aa-aber-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SelectInput,
    DataGrid
  , ButtonComponent],
  templateUrl: './aa-aber-form.html',
  styleUrl: './aa-aber-form.scss'
})
export class AaAberForm implements OnInit {
  private fb = inject(FormBuilder);
  private call = inject(OperationalMaintenanceApi);
  private defect = inject(DefectService);
  private toaster = inject(NotificationService);
  private router = inject(Router);
  private opMaintenance = inject(OperationalMaintenanceApi);


  selectedSpares = input<SpareItem[]>([]);
  modalData = input<ConfirmModalData | undefined>();


  @Output() openSpare = new EventEmitter<void>();
  @Output() removeSpare = new EventEmitter<string>();
  @Output() openConfirm = new EventEmitter<void>();
  @Output() cancelForm = new EventEmitter<void>();
  form: FormGroup;

  onCancel(): void {
    this.cancelForm.emit();
  }

  equipmentOptions: SelectOption[] = [];
  nomenclatureOptions: SelectOption[] = [];

  masterEquipmentList: MasterEquipmentItem[] = [];

  constructor() {
    this.form = this.fb.group({

      equipmentName: ['', Validators.required],

      nomenclature: ['', Validators.required],

      dartNo: [''],

      previousDartNo: [''],

      onBoardLocation: [''],

      aberType: ['minor'],

      description: ['', Validators.required,],

      authority: ['', Validators.required,],

      remarks: [''],

      sparesRequired: ['no']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadMasterData();

    this.listenEquipmentChange();
    this.listenNomenclatureChange();
  }

  openSpareModal() {
  this.openSpare.emit();
  }

  openConfirmModal() {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  if (
    this.form.get('sparesRequired')?.value === 'yes' &&
    this.selectedSpares().length === 0
  ) {
    this.toaster.error('Please select spare parts');
    return;
  }

  this.openConfirm.emit();
}

  get showSparesSection(): boolean {
  return this.form.get('sparesRequired')?.value === 'yes';
  }

  private buildPayload(modalData: ConfirmModalData) {
    const value = this.form.value;

    const spares = this.selectedSpares().map((item: SpareItem) => ({
      pattern: item.item_code,
      description: item.item_desc,
      qty: item.qtyRequired || 1,
      inventory_type: item.inventoryType || 'OBS'
    }));

    return {
      dart_type: 'ABER',
      a_nomenclature: value.nomenclature,
      aber_type: value.aberType,
      description: value.description,
      authority: value.authority,
      remarks: value.remarks,

      maintenance_period:
        modalData?.dartForMaintenance?.toUpperCase() ?? '',

      dart_occasion:
        modalData?.dartOccasion ?? '',

      startDate:
        modalData?.startDate ?? '',

      endDate:
        modalData?.endDate ?? '',

      ops_period_id:
        modalData?.existingRefit ?? '',

      obs_spares: JSON.stringify(spares)
    };
  }


  async submit(modalData: ConfirmModalData): Promise<void> {

    if (this.form.invalid) {

      this.form.markAllAsTouched();

      return;
    }

    const payload = this.buildPayload(modalData);

    try {
      const response = await firstValueFrom(
        this.call.saveAberDefect(payload)
      ) as SaveAberResponse;

      this.toaster.success(
        response?.message || 'ABER created successfully'
      );

      this.router.navigateByUrl("/afterAuth/op-maintenance/defect/actions", {
        replaceUrl: true,
      });
    } catch (error) {
      console.error("Create ABER Error:", error);

      const err = error as HttpErrorResponse;
      const errorMessage =
        (err?.error as { message?: string })?.message ||
        'Failed to save ABER';

      this.toaster.error(errorMessage);
    }
  }
async loadMasterData() {
  try {
    const departmentId = (await this.opMaintenance.getCurrentDepartmentId()) ?? 1;
    const data = await this.defect.getMasterData(departmentId) as MasterDataResponse;
    this.form.patchValue({
      dartNo: data.next_suggested_dart_no,
      previousDartNo: data.previous_dart_no,
    });
    this.masterEquipmentList = data.equipment_list ?? [];

    this.equipmentOptions = this.masterEquipmentList
      .filter((item: MasterEquipmentItem) => (item.equipment_name ?? '') !== '')
      .map((item: MasterEquipmentItem) => ({
        label: item.equipment_name ?? '',
        value: item.id ?? ''
      }));
   } catch (error) {
    console.error(error)
    this.toaster.error(
      'Failed to load master data'
    );

  }

}
  private listenEquipmentChange(): void {

    this.form
      .get('equipmentName')
      ?.valueChanges.subscribe(async (equipmentId) => {

        this.form.patchValue(
          {
            nomenclature: null
          },
          {
            emitEvent: false
          }
        );

        this.nomenclatureOptions = [];

        // const equipment =
        //   this.masterEquipmentList.find(
        //     (e: any) =>
        //      String(e.pk) === String(equipmentId)
        //   );
        const equipment =
          this.masterEquipmentList.find(
            (e: MasterEquipmentItem) =>
              String(e.id) === String(equipmentId)
          );

        if (!equipment) {
          return;
        }

        try {

          const response =
            await firstValueFrom(
              this.call.getEquipmentObjects(
                equipment.equipment_code ?? ''
              )
            ) as EquipmentObjectsResponse;

          this.nomenclatureOptions =
            (response?.ship_equipments || [])
              .filter((item) => item.nomenclature !== '')
              .map((item) => ({
                label: item.nomenclature,
                value: item.id
              }));
        } catch (error) {

          console.error(
            'Failed loading nomenclature',
            error
          );

        }
      });
  }

  private listenNomenclatureChange(): void {

    this.form
      .get('nomenclature')
      ?.valueChanges.subscribe(async (nomenclatureId) => {

        if (!nomenclatureId) {

          this.form.patchValue(
            {
              onBoardLocation: null
            },
            {
              emitEvent: false
            }
          );

          return;
        }

        try {

          const response =
            await firstValueFrom(
              this.call.getNomenclatureDetails(
                nomenclatureId
              )
            ) as NomenclatureDetailsResponse;

          this.form.patchValue({
            onBoardLocation:
              response.location_on_board
          });

        } catch (error) {

          console.error(
            'Failed loading nomenclature details',
            error
          );

        }
      });
  }

  selectedSpareColumns: ColDef[] = [
    {
      field: "item_code",
      headerName: "Pattern No",
    },
    {
      field: "item_desc",
      headerName: "Description",
      flex: 1,
    },
    {
      field: "inventoryType",
      headerName: "Inventory Type",
    },
    {
      field: "crp_category",
      headerName: "WED Inventory Type",
    },
    {
      headerName: "Qty Required",
      field: "qtyRequired",
      editable: true,
      cellEditor: "agNumberCellEditor",
      valueGetter: (params: CellCallbackParams) => (params.data as SpareItem | undefined)?.qtyRequired ?? 1,
      valueSetter: (params: CellCallbackParams) => {
        const data = params.data as SpareItem | undefined;
        if (data) {
          data.qtyRequired = Number(params['newValue'] as string);
        }
        return true;
      },
    },
    {
      headerName: "Actions",
      cellRenderer: (params: ICellRendererParams) => {
        const data = params.data as SpareItem | undefined;
        const btn = document.createElement("button");

        btn.innerText = "Remove";
        btn.className = "remove-btn";

        btn.addEventListener("click", () => {
          this.removeSpare.emit(String(data?.pk ?? ''));
        });

        return btn;
      },
    },
  ];
}
