import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { defaultIfEmpty, finalize, forkJoin, of } from 'rxjs';
import {
  AgActionCellComponent,
  ReusableDeleteDialogComponent,
} from '../../ui/master-compat';
import { AddFormComponent } from '../../ui/add-form/add-form.component';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { ApiService, DropdownOption } from '../../api.service';
import { ToastService } from '../../services/toast.service';

function getStoredUser(): any {
  try {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : {};
  } catch {
    return {};
  }
}

function getUserProcessName(): string {
  const u = getStoredUser();
  return String(u?.user_roles?.[0]?.process_name || u?.process_name || '');
}

function getUserSatelliteUnitId(): number | null {
  const u = getStoredUser();
  const id = u?.satellite_unit_id ?? u?.user_roles?.[0]?.satellite_unit_id;
  return id != null && id !== '' ? Number(id) : null;
}

function getUserSatelliteUnitName(): string {
  const u = getStoredUser();
  return String(u?.satellite_unit_name ?? u?.user_roles?.[0]?.satellite_unit_name ?? '');
}

function getUserShipId(): number | null {
  const u = getStoredUser();
  const id = u?.ship_id ?? u?.user_roles?.[0]?.ship_id;
  return id != null && id !== '' ? Number(id) : null;
}

function getUserShipName(): string {
  const u = getStoredUser();
  return String(u?.ship_name ?? u?.user_roles?.[0]?.ship_name ?? '');
}

function isUserShipProcess(): boolean {
  return getUserProcessName().toLowerCase().includes('ship');
}

function isUserSuperAdmin(): boolean {
  return Boolean(getStoredUser()?.is_superuser || getStoredUser()?.is_admin);
}

function isUserSuperuser(): boolean {
  return Boolean(getStoredUser()?.is_superuser);
}

type SubGroupFlag = 'ship' | 'satelliteunit';

const API_LIST = 'master/sub-group-config/';
const FLAG_SHIP: SubGroupFlag = 'ship';
const FLAG_SATELLITE: SubGroupFlag = 'satelliteunit';
/** CTT trial unit — sub satellite unit dropdown is shown after satellite unit. */
const CTT_TRIAL_UNIT_ID = 6;

@Component({
  selector: 'app-form-permission',
  standalone: true,
  templateUrl: './form-permission.html',
  styleUrl: './form-permission.css',
  imports: [
    CommonModule,
    FormsModule,
    PaginateTableComponent,
    AddFormComponent,
    ReusableDeleteDialogComponent,
  ],
  host: { class: 'block h-full min-h-0' },
})
export class FormPermission implements OnInit {
  @ViewChild('subGroupTable') subGroupTable?: PaginateTableComponent;

  readonly listUrl = API_LIST;
  readonly isSuperAdmin = isUserSuperAdmin() || isUserSuperuser();

  isFormOpen = false;
  isEditMode = false;
  editId: number | null = null;
  editFormData: Record<string, unknown> = {};
  formConfig: any[] = [];
  saving = false;

  showDeleteDialog = false;
  deleteId: number | null = null;
  deleteName = '';
  deleteLoading = false;

  private shipOptions: DropdownOption<number>[] = [];
  private trialUnitOptions: DropdownOption<number>[] = [];
  private userOptions: DropdownOption<number>[] = [];
  private readonly userLabelById = new Map<number, string>();
  private lastFlag: SubGroupFlag | null = null;
  private lastTrialKey = '';
  private lastSatelliteKey = '';
  private lastSubSatelliteKey = '';

  addButtons = [
    {
      label: 'Add Sub Group',
      key: 'add',
      show: true,
      cls: 'bg-blue-900 text-white',
    },
  ];

  columnDefs = [
    {
      headerName: 'Ser',
      valueGetter: (p: any) => (p.node?.rowIndex ?? 0) + 1,
      width: 70,
      minWidth: 60,
      pinned: 'left' as const,
    },
    {
      field: 'name',
      headerName: 'Sub-Group',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 180,
      valueGetter: (p: any) => {
        const name = p?.data?.name ?? '—';
        const flag = this.flagLabel(p?.data?.flag);
        return flag ? `${name} (${flag})` : name;
      },
    },
    {
      field: 'units_display',
      headerName: 'Unit',
      filter: 'agTextColumnFilter',
      flex: 0.75,
      width: 150,
      minWidth: 130,
      maxWidth: 180,
      cellClass: 'fp-summary-cell',
      valueGetter: (p: any) => this.formatNameSummary(this.getUnitNames(p?.data)),
      tooltipValueGetter: (p: any) => this.formatNameTooltip(this.getUnitNames(p?.data)),
      cellRenderer: (p: any) =>
        this.renderSummaryCell(this.getUnitNames(p?.data)),
    },
    {
      field: 'trial_display',
      headerName: 'Trial Types',
      filter: 'agTextColumnFilter',
      flex: 2,
      minWidth: 280,
      cellClass: 'fp-summary-cell',
      valueGetter: (p: any) => this.formatNameSummary(this.getTrialNames(p?.data)),
      tooltipValueGetter: (p: any) => this.formatNameTooltip(this.getTrialNames(p?.data)),
      cellRenderer: (p: any) =>
        this.renderSummaryCell(this.getTrialNames(p?.data)),
    },
    {
      field: 'users_display',
      headerName: 'Users',
      filter: 'agTextColumnFilter',
      flex: 1,
      minWidth: 160,
      maxWidth: 220,
      cellClass: 'fp-summary-cell',
      valueGetter: (p: any) => this.formatNameSummary(this.getUserNames(p?.data)),
      tooltipValueGetter: (p: any) => this.formatNameTooltip(this.getUserNames(p?.data)),
      cellRenderer: (p: any) =>
        this.renderSummaryCell(this.getUserNames(p?.data)),
    },
    {
      headerName: 'Actions',
      field: 'actions',
      width: 110,
      maxWidth: 120,
      sortable: false,
      filter: false,
      floatingFilter: false,
      pinned: 'right' as const,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (key: string, row: any) => {
          if (key === 'edit') this.openEdit(row);
          if (key === 'delete') this.openDeleteDialog(row);
        },
        actions: [
          { key: 'edit', label: 'Edit', iconClass: 'fa fa-pencil' },
          { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash' },
        ],
      },
    },
  ];

  constructor(
    private readonly api: ApiService,
    private readonly toast: ToastService,
    private readonly cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {
    this.buildFormConfig();
    this.loadMasterDropdowns();
  }

  handleAddButtonClick(event: { key: string }): void {
    if (event.key === 'add') this.openAdd();
  }

  openAdd(): void {
    this.isEditMode = false;
    this.editId = null;
    this.editFormData = this.emptyFormData();
    const flag = this.editFormData['flag'] as SubGroupFlag;
    this.lastFlag = flag;
    this.lastTrialKey = '';
    this.lastSatelliteKey = '';
    this.lastSubSatelliteKey = '';
    this.buildFormConfig(this.editFormData);
    this.applySessionPrefills();
    this.isFormOpen = true;
  }

  openEdit(row: any): void {
    this.isEditMode = true;
    this.editId = Number(row?.id ?? null);
    this.lastFlag = null;
    this.lastTrialKey = '';
    this.lastSatelliteKey = '';
    this.lastSubSatelliteKey = '';

    const flag = this.normalizeFlag(row?.flag) ?? this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const trialUnitForms = row?.trial_unit_forms ?? [];
    const satelliteUnitForms = row?.satellite_unit_forms ?? [];
    const ships = row?.ships ?? [];
    const satelliteUnits = row?.satellite_units ?? [];
    const subSatelliteUnits =
      row?.sub_satellite_unit_forms ?? row?.sub_satellite_units ?? [];
    const trialTypes = row?.trial_types ?? [];
    const users = row?.users ?? [];

    const trialIds = trialUnitForms.map((t: any) => Number(t.id));
    const satFormIds = satelliteUnitForms.length
      ? satelliteUnitForms.map((s: any) => Number(s.id))
      : satelliteUnits.map((s: any) => Number(s.id));
    const subSatIds = subSatelliteUnits.length
      ? subSatelliteUnits.map((s: any) =>
        Number(s.mapped_satellite_unit_id ?? s.id),
      )
      : this.normalizeIdArray(
        row?.sub_satellite_unit_ids ?? row?.sub_satellite_unit_id,
      );

    this.editFormData = {
      name: row?.name ?? '',
      flag,
      linked_unit_id:
        shipMode && ships.length ? Number(ships[0].id) : null,
      // Ship/Shore: multi; Satellite: single
      trial_unit_ids: shipMode ? trialIds : [],
      trial_unit_id: !shipMode && trialIds.length ? trialIds[0] : null,
      satellite_unit_ids: shipMode ? satFormIds : [],
      satellite_unit_id: !shipMode && satFormIds.length ? satFormIds[0] : null,
      sub_satellite_unit_ids: shipMode ? subSatIds : [],
      sub_satellite_unit_id: !shipMode && subSatIds.length ? subSatIds[0] : null,
      trial_type_ids: trialTypes.map((t: any) => Number(t.id)),
      user_ids: users.map((u: any) => Number(u.user_id ?? u.id)),
    };

    const activeTrialIds = shipMode
      ? trialIds
      : trialIds.length
        ? [trialIds[0]]
        : [];
    const activeSatIds = shipMode
      ? satFormIds
      : satFormIds.length
        ? [satFormIds[0]]
        : [];

    this.lastFlag = flag;
    this.lastTrialKey = this.idsKey(activeTrialIds);
    this.lastSatelliteKey = this.idsKey(activeSatIds);
    this.lastSubSatelliteKey = this.idsKey(
      shipMode ? subSatIds : subSatIds.length ? [subSatIds[0]] : [],
    );

    this.buildFormConfig(this.editFormData);

    if (satFormIds.length) {
      const seed = satelliteUnitForms.length
        ? satelliteUnitForms
        : satelliteUnits;
      this.setFieldOptions(
        this.satFieldKey(shipMode),
        seed.map((u: any) => ({
          label: u.name,
          value: Number(u.id),
        })),
      );
    }
    if (subSatIds.length) {
      this.setFieldOptions(
        this.subSatFieldKey(shipMode),
        subSatelliteUnits.map((u: any) => ({
          label: String(u.name ?? '').trim() || `Sub Satellite Unit #${u.mapped_satellite_unit_id ?? u.id}`,
          value: Number(u.mapped_satellite_unit_id ?? u.id),
        })),
      );
    }
    if (trialTypes.length) {
      this.setFieldOptions(
        'trial_type_ids',
        trialTypes.map((t: any) => ({ label: t.name, value: Number(t.id) })),
      );
    }
    if (activeTrialIds.length) {
      this.loadSatelliteUnitsForTrialUnits(
        activeTrialIds,
        activeSatIds,
        () => {
          if (activeSatIds.length) {
            this.loadTrialTypesForSatelliteUnits(
              activeSatIds,
              trialTypes.map((t: any) => Number(t.id)),
            );
            this.loadSubSatelliteUnitsForSatelliteUnits(activeSatIds, subSatIds);
          }
        },
      );
    }

    this.isFormOpen = true;
  }

  onFormOpenChange(open: boolean): void {
    this.isFormOpen = open;
    if (!open) {
      this.isEditMode = false;
      this.editId = null;
      this.editFormData = {};
      this.lastFlag = null;
      this.lastTrialKey = '';
      this.lastSatelliteKey = '';
      this.lastSubSatelliteKey = '';
    }
  }

  onFieldChange(event: any): void {
    const formValue = event?.formValue ?? event?.form ?? {};
    if (!formValue || typeof formValue !== 'object') return;

    this.editFormData = { ...this.editFormData, ...formValue };

    const flag = (this.normalizeFlag(formValue.flag) ??
      this.editFormData['flag'] ??
      this.resolveDefaultFlag()) as SubGroupFlag;
    const shipMode = flag === FLAG_SHIP;

    if (flag !== this.lastFlag) {
      this.lastFlag = flag;
      // Rebuild trial/satellite field types (multi vs single) for the new mode
      this.editFormData = {
        ...this.editFormData,
        linked_unit_id: shipMode
          ? this.toSingleId(this.editFormData['linked_unit_id'])
          : null,
        trial_unit_ids: shipMode
          ? this.normalizeIdArray(
            this.editFormData['trial_unit_ids'] ??
            this.editFormData['trial_unit_id'],
          )
          : [],
        trial_unit_id: shipMode
          ? null
          : this.toSingleId(
            this.editFormData['trial_unit_id'] ??
            this.editFormData['trial_unit_ids'],
          ),
        satellite_unit_ids: shipMode
          ? this.normalizeIdArray(
            this.editFormData['satellite_unit_ids'] ??
            this.editFormData['satellite_unit_id'],
          )
          : [],
        satellite_unit_id: shipMode
          ? null
          : this.toSingleId(
            this.editFormData['satellite_unit_id'] ??
            this.editFormData['satellite_unit_ids'],
          ),
        sub_satellite_unit_ids: shipMode
          ? this.normalizeIdArray(
            this.editFormData['sub_satellite_unit_ids'] ??
            this.editFormData['sub_satellite_unit_id'],
          )
          : [],
        sub_satellite_unit_id: shipMode
          ? null
          : this.toSingleId(
            this.editFormData['sub_satellite_unit_id'] ??
            this.editFormData['sub_satellite_unit_ids'],
          ),
        trial_type_ids: [],
      };
      this.buildFormConfig(this.editFormData);
      this.setFieldOptions('trial_type_ids', []);
      this.setFieldOptions(this.satFieldKey(shipMode), []);
      this.setFieldOptions(this.subSatFieldKey(shipMode), []);

      const trialIdsOnFlag = this.getTrialUnitIdsFromForm(
        this.editFormData,
        shipMode,
      );
      const satIdsOnFlag = this.getSatelliteUnitIdsFromForm(
        this.editFormData,
        shipMode,
      );
      const subSatIdsOnFlag = this.getSubSatelliteUnitIdsFromForm(
        this.editFormData,
        shipMode,
      );
      // Avoid cascade wipe on type switch; reload options while keeping converted ids
      this.lastTrialKey = this.idsKey(trialIdsOnFlag);
      this.lastSatelliteKey = this.idsKey(satIdsOnFlag);
      this.lastSubSatelliteKey = this.idsKey(subSatIdsOnFlag);
      if (trialIdsOnFlag.length) {
        this.loadSatelliteUnitsForTrialUnits(
          trialIdsOnFlag,
          satIdsOnFlag,
          () => {
            if (satIdsOnFlag.length) {
              this.loadTrialTypesForSatelliteUnits(satIdsOnFlag);
              this.loadSubSatelliteUnitsForSatelliteUnits(
                satIdsOnFlag,
                subSatIdsOnFlag,
              );
            }
          },
        );
      }
      this.cdr.markForCheck();
      return;
    }

    // Prefer editFormData so flag switch conversion (multi ↔ single keys) is respected
    const trialIds = this.getTrialUnitIdsFromForm(this.editFormData, shipMode);
    const trialKey = this.idsKey(trialIds);
    if (trialKey !== this.lastTrialKey) {
      this.lastTrialKey = trialKey;
      this.editFormData = {
        ...this.editFormData,
        satellite_unit_ids: [],
        satellite_unit_id: null,
        sub_satellite_unit_ids: [],
        sub_satellite_unit_id: null,
        trial_type_ids: [],
      };
      this.setFieldOptions(this.satFieldKey(shipMode), []);
      this.setFieldOptions(this.subSatFieldKey(shipMode), []);
      this.setFieldOptions('trial_type_ids', []);
      this.lastSatelliteKey = '';
      this.lastSubSatelliteKey = '';
      this.updateSubSatelliteUnitVisibility();
      if (trialIds.length) {
        this.loadSatelliteUnitsForTrialUnits(trialIds);
      }
    }

    const satIds = this.getSatelliteUnitIdsFromForm(this.editFormData, shipMode);
    const satKey = this.idsKey(satIds);
    if (satKey !== this.lastSatelliteKey) {
      this.lastSatelliteKey = satKey;
      this.editFormData = {
        ...this.editFormData,
        sub_satellite_unit_ids: [],
        sub_satellite_unit_id: null,
      };
      this.lastSubSatelliteKey = '';
      this.setFieldOptions(this.subSatFieldKey(shipMode), []);
      this.updateSubSatelliteUnitVisibility();
      if (this.shouldShowSubSatelliteUnit() && satIds.length) {
        this.loadSubSatelliteUnitsForSatelliteUnits(satIds);
      }
      this.loadTrialTypesForSatelliteUnits(satIds);
    }

    const subSatIds = this.getSubSatelliteUnitIdsFromForm(
      this.editFormData,
      shipMode,
    );
    const subSatKey = this.idsKey(subSatIds);
    if (subSatKey !== this.lastSubSatelliteKey) {
      this.lastSubSatelliteKey = subSatKey;
      if (this.shouldShowSubSatelliteUnit()) {
        this.loadTrialTypesForSatelliteUnits(satIds);
      }
    }

    this.cdr.markForCheck();
  }

  handleSubmit(formValue: any): void {
    if (this.saving) return;

    const v = formValue ?? this.editFormData;
    const name = String(v?.name ?? '').trim();
    if (!name) {
      this.toast.showError('Sub group name is required');
      return;
    }

    const flag =
      this.normalizeFlag(v?.flag) ?? this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const linkedId = this.toSingleId(v?.linked_unit_id ?? v?.linked_unit_ids);
    const satelliteIds = shipMode
      ? this.normalizeIdArray(v?.satellite_unit_ids ?? v?.satellite_unit_id)
      : this.normalizeIdArray(
        v?.satellite_unit_id != null
          ? [v.satellite_unit_id]
          : v?.satellite_unit_ids,
      );
    const subSatelliteIds = this.shouldShowSubSatelliteUnit(v)
      ? this.getSubSatelliteUnitIdsFromForm(v, shipMode)
      : [];
    const trialTypeIds = this.normalizeIdArray(v?.trial_type_ids);
    const userIds = this.normalizeIdArray(v?.user_ids);

    const payload: Record<string, unknown> = {
      name,
      description: '',
      flag,
      ship_ids: shipMode && linkedId != null ? [linkedId] : [],
      satellite_unit_ids: satelliteIds,
      sub_satellite_unit_ids: subSatelliteIds,
      trial_type_ids: trialTypeIds,
      user_ids: userIds,
      active: 1,
    };

    const isEdit = this.isEditMode && this.editId != null;
    const endpoint = isEdit ? `${API_LIST}${this.editId}/` : API_LIST;
    if (isEdit) payload['id'] = this.editId;

    this.saving = true;
    this.api
      .post(endpoint, payload)
      .pipe(finalize(() => (this.saving = false)))
      .subscribe({
        next: () => {
          this.toast.showSuccess(
            isEdit ? 'Sub group updated successfully' : 'Sub group created successfully',
          );
          this.isFormOpen = false;
          this.refreshTable();
        },
        error: (err: Error) => {
          this.toast.showError(err.message || 'Failed to save sub group');
        },
      });
  }

  openDeleteDialog(row: any): void {
    this.deleteId = Number(row?.id ?? null);
    this.deleteName = String(row?.name ?? 'this sub group');
    this.showDeleteDialog = true;
  }

  closeDeleteDialog(): void {
    this.showDeleteDialog = false;
    this.deleteId = null;
    this.deleteName = '';
    this.deleteLoading = false;
  }

  confirmDelete(): void {
    if (!this.deleteId) return;
    this.deleteLoading = true;
    this.api
      .post(API_LIST, { id: this.deleteId, active: 3, delete: true })
      .pipe(finalize(() => (this.deleteLoading = false)))
      .subscribe({
        next: () => {
          this.toast.showSuccess('Sub group deleted successfully');
          this.closeDeleteDialog();
          this.refreshTable();
        },
        error: (err: Error) => {
          this.toast.showError(err.message || 'Failed to delete sub group');
        },
      });
  }

  private refreshTable(): void {
    this.subGroupTable?.refreshTable();
  }

  private loadMasterDropdowns(): void {
    this.api
      .getDropdownData<{ name: string; id: number }, number>('master/ships/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((opts: any) => {
        this.shipOptions = opts;
        this.setFieldOptions('linked_unit_id', opts);
      });

    this.api
      .getDropdownData<{ name: string; id: number }, number>('master/trial-units/', {
        labelKey: 'name',
        valueKey: 'id',
      })
      .subscribe((opts: any) => {
        this.trialUnitOptions = opts;
        this.setFieldOptions('trial_unit_id', opts);
        this.setFieldOptions('trial_unit_ids', opts);
      });

    this.api.get<unknown>('api/auth/users').subscribe({
      next: (res: any) => {
        const raw = this.normalizeList<any>(res);
        this.userLabelById.clear();
        this.userOptions = raw.map((u) => {
          const id = Number(u?.id ?? u?.user_id);
          const label =
            String(u?.loginname ?? u?.login_name ?? '').trim() ||
            u?.email ||
            `User #${id}`;
          this.userLabelById.set(id, label);
          return { label, value: id };
        });
        this.setFieldOptions('user_ids', this.userOptions);
        // Redraw user summary cells once labels are known
        this.subGroupTable?.refreshTable();
      },
    });
  }

  /** First name + “+N other”; hover shows full list. */
  private formatNameSummary(names: string[]): string {
    if (!names.length) return '—';
    if (names.length === 1) return names[0];
    const rest = names.length - 1;
    return `${names[0]} +${rest} other${rest > 1 ? 's' : ''}`;
  }

  private formatNameTooltip(names: string[]): string {
    return names.length ? names.join('\n') : '—';
  }

  /**
   * Renders "Name" (ellipsis) + optional "+N other" suffix that never leaves the cell.
   */
  private renderSummaryCell(names: string[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'fp-name-summary';
    wrap.title = this.formatNameTooltip(names);

    const text = document.createElement('span');
    text.className = 'fp-name-summary__text';

    if (!names.length) {
      text.textContent = '—';
      wrap.appendChild(text);
      return wrap;
    }

    text.textContent = names[0];
    wrap.appendChild(text);

    if (names.length > 1) {
      const rest = names.length - 1;
      const more = document.createElement('span');
      more.className = 'fp-name-summary__more';
      more.textContent = `+${rest} other${rest > 1 ? 's' : ''}`;
      wrap.appendChild(more);
    }

    return wrap;
  }

  private getUnitNames(row: any): string[] {
    if (!row) return [];
    const flag = this.normalizeFlag(row.flag);
    const list =
      flag === FLAG_SHIP
        ? (row.ships as { name?: string }[]) ?? []
        : (row.satellite_units as { name?: string }[]) ?? [];
    return list
      .map((item) => String(item?.name ?? '').trim())
      .filter(Boolean);
  }

  private getTrialNames(row: any): string[] {
    if (!row) return [];
    const list = (row.trial_types as { name?: string }[]) ?? [];
    return list
      .map((item) => String(item?.name ?? '').trim())
      .filter(Boolean);
  }

  private getUserNames(row: any): string[] {
    if (!row) return [];
    const list =
      (row.users as {
        user_id?: number;
        id?: number;
        loginname?: string;
        login_name?: string;
        name?: string;
      }[]) ?? [];
    return list.map((u) => {
      const id = Number(u?.user_id ?? u?.id);
      const login = String(u?.loginname ?? u?.login_name ?? '').trim();
      if (login) return login;
      if (!Number.isNaN(id) && this.userLabelById.has(id)) {
        return this.userLabelById.get(id)!;
      }
      return Number.isNaN(id) ? 'User' : `User #${id}`;
    });
  }

  private loadSatelliteUnitsForTrialUnits(
    trialUnitIds: number[],
    preserveIds: number[] = [],
    onLoaded?: () => void,
  ): void {
    if (!trialUnitIds.length) {
      const flag = this.normalizeFlag(this.editFormData['flag']) ?? this.resolveDefaultFlag();
      this.setFieldOptions(this.satFieldKey(flag === FLAG_SHIP), []);
      this.formConfig = [...this.formConfig];
      this.cdr.detectChanges();
      return;
    }

    const requests = trialUnitIds.map((trialUnitId) =>
      this.api.getDropdownData<{ name: string; id: number }, number>(
        'master/satellite-units/',
        { labelKey: 'name', valueKey: 'id' },
        { trial_unit: trialUnitId },
      ),
    );

    forkJoin(requests.length ? requests : [of([])])
      .pipe(defaultIfEmpty([]))
      .subscribe((results) => {
        const merged = new Map<number, DropdownOption<number>>();
        results.flat().forEach((opt) => merged.set(Number(opt.value), opt));
        const options = Array.from(merged.values());
        const flag =
          this.normalizeFlag(this.editFormData['flag']) ??
          this.resolveDefaultFlag();
        const shipMode = flag === FLAG_SHIP;
        this.setFieldOptions(this.satFieldKey(shipMode), options);

        if (preserveIds.length) {
          if (shipMode) {
            this.editFormData = {
              ...this.editFormData,
              satellite_unit_ids: preserveIds,
            };
          } else {
            this.editFormData = {
              ...this.editFormData,
              satellite_unit_id: preserveIds[0] ?? null,
            };
          }
        }

        onLoaded?.();
        this.formConfig = [...this.formConfig];
        this.cdr.detectChanges();
      });
  }

  private loadSubSatelliteUnitsForSatelliteUnits(
    satelliteIds: number[],
    preserveIds: number[] = [],
  ): void {
    const flag =
      this.normalizeFlag(this.editFormData['flag']) ?? this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const fieldKey = this.subSatFieldKey(shipMode);

    if (!this.shouldShowSubSatelliteUnit() || !satelliteIds.length) {
      this.setFieldOptions(fieldKey, []);
      if (!preserveIds.length) {
        this.editFormData = {
          ...this.editFormData,
          sub_satellite_unit_ids: [],
          sub_satellite_unit_id: null,
        };
      }
      this.formConfig = [...this.formConfig];
      this.cdr.detectChanges();
      return;
    }

    const requests = satelliteIds.map((satelliteId) =>
      this.api.getDropdownData<
        { name: string; mapped_satellite_unit_id: number },
        number
      >(
        'master/sub-satellite-units/',
        { labelKey: 'name', valueKey: 'mapped_satellite_unit_id' },
        { satellite_unit: satelliteId, ctt_s_u: satelliteId },
      ),
    );

    forkJoin(requests.length ? requests : [of([])])
      .pipe(defaultIfEmpty([]))
      .subscribe((results) => {
        const merged = new Map<number, DropdownOption<number>>();
        results.flat().forEach((opt) => {
          const id = Number(opt.value);
          if (!Number.isNaN(id)) merged.set(id, { label: opt.label, value: id });
        });
        const options = Array.from(merged.values());
        this.setFieldOptions(fieldKey, options);

        if (preserveIds.length) {
          const allowed = new Set(options.map((o) => Number(o.value)));
          const kept = preserveIds.filter((id) => allowed.has(id));
          if (shipMode) {
            this.editFormData = {
              ...this.editFormData,
              sub_satellite_unit_ids: kept,
            };
          } else {
            this.editFormData = {
              ...this.editFormData,
              sub_satellite_unit_id: kept[0] ?? null,
            };
          }
        }

        this.formConfig = [...this.formConfig];
        this.cdr.detectChanges();
      });
  }

  private loadTrialTypesForSatelliteUnits(
    satelliteIds: number[],
    preserveIds: number[] = [],
  ): void {
    if (!satelliteIds.length) {
      this.setFieldOptions('trial_type_ids', []);
      this.editFormData = { ...this.editFormData, trial_type_ids: [] };
      this.formConfig = [...this.formConfig];
      this.cdr.detectChanges();
      return;
    }

    const flag =
      this.normalizeFlag(this.editFormData['flag']) ?? this.resolveDefaultFlag();
    const subSatIds = this.getSubSatelliteUnitIdsFromForm(
      this.editFormData,
      flag === FLAG_SHIP,
    );

    const requests = satelliteIds.map((satelliteId) =>
      this.api.getDropdownData<{ name: string; id: number }, number>(
        'master/trial-types/',
        { labelKey: 'name', valueKey: 'id' },
        {
          satellite_unit: satelliteId,
          ...(subSatIds.length === 1
            ? { sub_satellite_unit_id: subSatIds[0] }
            : subSatIds.length
              ? { sub_satellite_unit_id: subSatIds }
              : {}),
        },
      ),
    );

    forkJoin(requests.length ? requests : [of([])])
      .pipe(defaultIfEmpty([]))
      .subscribe((results) => {
        const merged = new Map<number, DropdownOption<number>>();
        results.flat().forEach((opt) => merged.set(Number(opt.value), opt));
        const options = Array.from(merged.values());
        this.setFieldOptions('trial_type_ids', options);

        if (preserveIds.length) {
          const allowed = new Set(options.map((o) => Number(o.value)));
          this.editFormData = {
            ...this.editFormData,
            trial_type_ids: preserveIds.filter((id) => allowed.has(id)),
          };
        }

        this.formConfig = [...this.formConfig];
        this.cdr.detectChanges();
      });
  }

  private buildFormConfig(data?: Record<string, unknown>): void {
    const flag =
      this.normalizeFlag(data?.['flag']) ?? this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const showSubSat = this.shouldShowSubSatelliteUnit(data);

    // Order: Name → Type → Ship/Shore (if ship) → Trial Unit → Satellite Unit → Sub Satellite Unit (CTT) → Trial Types → Users
    // Ship/Shore: Trial Unit + Satellite Unit are multi-select; Satellite type: single-select
    this.formConfig = [
      {
        label: 'Sub Group Name',
        type: 'text',
        key: 'name',
        placeholder: 'e.g. P&V',
        colSpan: 1.5,
        required: true,
      },
      {
        label: 'Type',
        type: 'radio',
        key: 'flag',
        colSpan: 1.5,
        required: true,
        hide: !this.isSuperAdmin,
        options: [
          { label: 'Ship/Shore', value: FLAG_SHIP },
          { label: 'Satellite', value: FLAG_SATELLITE },
        ],
      },
      {
        label: 'Ship/Shore',
        type: 'select',
        key: 'linked_unit_id',
        placeholder: 'Select ship/shore',
        colSpan: 1.5,
        required: shipMode,
        hide: !shipMode,
        options: [...this.shipOptions],
      },
      shipMode
        ? {
          label: 'Trial Unit',
          type: 'select-multiple',
          key: 'trial_unit_ids',
          placeholder: 'Select trial units',
          colSpan: 1.5,
          required: true,
          options: [...this.trialUnitOptions],
        }
        : {
          label: 'Trial Unit',
          type: 'select',
          key: 'trial_unit_id',
          placeholder: 'Select trial unit',
          colSpan: 1.5,
          required: true,
          options: [...this.trialUnitOptions],
        },
      shipMode
        ? {
          label: 'Satellite Unit',
          type: 'select-multiple',
          key: 'satellite_unit_ids',
          placeholder: 'Select satellite units',
          colSpan: 1.5,
          required: true,
          options: [],
        }
        : {
          label: 'Satellite Unit',
          type: 'select',
          key: 'satellite_unit_id',
          placeholder: 'Select satellite unit',
          colSpan: 1.5,
          required: true,
          options: [],
        },
      shipMode
        ? {
          label: 'Sub Satellite Unit',
          type: 'select-multiple',
          key: 'sub_satellite_unit_ids',
          placeholder: 'Select sub satellite units',
          colSpan: 1.5,
          required: showSubSat,
          hide: !showSubSat,
          options: [],
        }
        : {
          label: 'Sub Satellite Unit',
          type: 'select',
          key: 'sub_satellite_unit_id',
          placeholder: 'Select sub satellite unit',
          colSpan: 1.5,
          required: showSubSat,
          hide: !showSubSat,
          options: [],
        },
      {
        label: 'Trial Types',
        type: 'select-multiple',
        key: 'trial_type_ids',
        placeholder: 'Select trial types',
        colSpan: 1.5,
        required: true,
        options: [],
      },
      {
        label: 'Users',
        type: 'select-multiple',
        key: 'user_ids',
        placeholder: 'Search and select users',
        colSpan: 3,
        options: [...this.userOptions],
      },
    ];

    this.lastFlag = flag;
  }

  private setFieldOptions(key: string, options: DropdownOption<number>[]): void {
    this.formConfig = this.formConfig.map((field) =>
      field.key === key ? { ...field, options: [...options] } : field,
    );
  }

  private emptyFormData(): Record<string, unknown> {
    const flag = this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const sessionShipId = this.toSingleId(getUserShipId());
    const sessionSatId = getUserSatelliteUnitId();

    return {
      name: '',
      flag,
      linked_unit_id: shipMode && sessionShipId != null ? sessionShipId : null,
      trial_unit_ids: [],
      trial_unit_id: null,
      satellite_unit_ids:
        shipMode && sessionSatId != null ? [sessionSatId] : [],
      satellite_unit_id:
        !shipMode && sessionSatId != null ? sessionSatId : null,
      sub_satellite_unit_ids: [],
      sub_satellite_unit_id: null,
      trial_type_ids: [],
      user_ids: [],
    };
  }

  /**
   * Prefill/disable fields from localStorage `user` (satellite unit, ship, etc.)
   * when the form is opened for create.
   */
  private applySessionPrefills(): void {
    const flag =
      this.normalizeFlag(this.editFormData['flag']) ?? this.resolveDefaultFlag();
    const shipMode = flag === FLAG_SHIP;
    const sessionShipId = this.toSingleId(getUserShipId());
    const sessionShipName = getUserShipName();
    const sessionSatId = getUserSatelliteUnitId();
    const sessionSatName = getUserSatelliteUnitName();
    const lockScope = !this.isSuperAdmin;

    // Ship/Shore from session ship_id
    if (shipMode && sessionShipId != null) {
      this.editFormData = {
        ...this.editFormData,
        linked_unit_id: sessionShipId,
      };
      if (sessionShipName) {
        const hasOpt = this.shipOptions.some(
          (o) => Number(o.value) === sessionShipId,
        );
        if (!hasOpt) {
          this.shipOptions = [
            { label: sessionShipName, value: sessionShipId },
            ...this.shipOptions,
          ];
        }
        this.setFieldOptions('linked_unit_id', this.shipOptions);
      }
      this.setFieldDisabled('linked_unit_id', lockScope);
    }

    // Satellite unit from session satellite_unit_id
    if (sessionSatId == null) {
      this.formConfig = [...this.formConfig];
      this.cdr.detectChanges();
      return;
    }

    if (shipMode) {
      this.editFormData = {
        ...this.editFormData,
        satellite_unit_ids: [sessionSatId],
      };
      this.setFieldOptions('satellite_unit_ids', [
        {
          label: sessionSatName || `Satellite Unit #${sessionSatId}`,
          value: sessionSatId,
        },
      ]);
      this.setFieldDisabled('satellite_unit_ids', lockScope);
      this.lastSatelliteKey = this.idsKey([sessionSatId]);
      this.loadTrialTypesForSatelliteUnits([sessionSatId]);
      this.resolveTrialUnitFromSatellite(sessionSatId, true);
    } else {
      this.editFormData = {
        ...this.editFormData,
        satellite_unit_id: sessionSatId,
      };
      this.setFieldOptions('satellite_unit_id', [
        {
          label: sessionSatName || `Satellite Unit #${sessionSatId}`,
          value: sessionSatId,
        },
      ]);
      this.setFieldDisabled('satellite_unit_id', lockScope);
      this.lastSatelliteKey = this.idsKey([sessionSatId]);
      this.loadTrialTypesForSatelliteUnits([sessionSatId]);
      this.resolveTrialUnitFromSatellite(sessionSatId, false);
    }

    this.formConfig = [...this.formConfig];
    this.cdr.detectChanges();
  }

  /** Resolve trial unit for a known satellite unit and prefill cascade. */
  private resolveTrialUnitFromSatellite(
    satelliteId: number,
    shipMode: boolean,
  ): void {
    this.api.get<unknown>('master/satellite-units/').subscribe({
      next: (res: any) => {
        const list = this.normalizeList<any>(res);
        const match = list.find((u) => Number(u?.id) === Number(satelliteId));
        if (!match) return;

        const trialUnitId = this.toSingleId(
          match.trial_unit ??
          match.trial_unit_id ??
          match.trialUnit ??
          match.trial_unit_form?.id,
        );
        if (trialUnitId == null) return;

        const trialLabel =
          String(
            match.trial_unit_name ??
            match.trial_unit_form?.name ??
            '',
          ).trim() || `Trial Unit #${trialUnitId}`;

        if (!this.trialUnitOptions.some((o) => Number(o.value) === trialUnitId)) {
          this.trialUnitOptions = [
            { label: trialLabel, value: trialUnitId },
            ...this.trialUnitOptions,
          ];
        }
        this.setFieldOptions('trial_unit_id', this.trialUnitOptions);
        this.setFieldOptions('trial_unit_ids', this.trialUnitOptions);

        if (shipMode) {
          this.editFormData = {
            ...this.editFormData,
            trial_unit_ids: [trialUnitId],
          };
          this.setFieldDisabled('trial_unit_ids', !this.isSuperAdmin);
        } else {
          this.editFormData = {
            ...this.editFormData,
            trial_unit_id: trialUnitId,
          };
          this.setFieldDisabled('trial_unit_id', !this.isSuperAdmin);
        }
        this.lastTrialKey = this.idsKey([trialUnitId]);

        this.loadSatelliteUnitsForTrialUnits(
          [trialUnitId],
          [satelliteId],
          () => {
            this.loadTrialTypesForSatelliteUnits([satelliteId]);
            this.updateSubSatelliteUnitVisibility();
            this.loadSubSatelliteUnitsForSatelliteUnits([satelliteId]);
          },
        );

        this.formConfig = [...this.formConfig];
        this.cdr.detectChanges();
      },
    });
  }

  private setFieldDisabled(key: string, disabled: boolean): void {
    this.formConfig = this.formConfig.map((field) =>
      field.key === key ? { ...field, disabled } : field,
    );
  }

  private satFieldKey(shipMode: boolean): string {
    return shipMode ? 'satellite_unit_ids' : 'satellite_unit_id';
  }

  private subSatFieldKey(shipMode: boolean): string {
    return shipMode ? 'sub_satellite_unit_ids' : 'sub_satellite_unit_id';
  }

  private shouldShowSubSatelliteUnit(
    formValue: Record<string, unknown> = this.editFormData,
  ): boolean {
    const flag =
      this.normalizeFlag(formValue?.['flag']) ?? this.resolveDefaultFlag();
    const trialIds = this.getTrialUnitIdsFromForm(
      formValue ?? {},
      flag === FLAG_SHIP,
    );
    return this.isCttTrialUnit(trialIds);
  }

  private isCttTrialUnit(ids: number[]): boolean {
    return ids.some((id) => {
      if (Number(id) === CTT_TRIAL_UNIT_ID) return true;
      const opt = this.trialUnitOptions.find(
        (o) => Number(o.value) === Number(id),
      );
      return /ctt/i.test(String(opt?.label ?? ''));
    });
  }

  private updateSubSatelliteUnitVisibility(): void {
    const show = this.shouldShowSubSatelliteUnit();
    const flag =
      this.normalizeFlag(this.editFormData['flag']) ?? this.resolveDefaultFlag();
    const key = this.subSatFieldKey(flag === FLAG_SHIP);
    this.formConfig = this.formConfig.map((field) =>
      field.key === 'sub_satellite_unit_id' ||
        field.key === 'sub_satellite_unit_ids'
        ? { ...field, hide: !show, required: show }
        : field,
    );
    if (!show) {
      this.editFormData = {
        ...this.editFormData,
        sub_satellite_unit_id: null,
        sub_satellite_unit_ids: [],
      };
      this.setFieldOptions(key, []);
    }
  }

  private getTrialUnitIdsFromForm(
    formValue: Record<string, unknown>,
    shipMode: boolean,
  ): number[] {
    if (shipMode) {
      return this.normalizeIdArray(
        formValue['trial_unit_ids'] ?? formValue['trial_unit_id'],
      );
    }
    const id = this.toSingleId(
      formValue['trial_unit_id'] ?? formValue['trial_unit_ids'],
    );
    return id != null ? [id] : [];
  }

  private getSatelliteUnitIdsFromForm(
    formValue: Record<string, unknown>,
    shipMode: boolean,
  ): number[] {
    if (shipMode) {
      return this.normalizeIdArray(
        formValue['satellite_unit_ids'] ?? formValue['satellite_unit_id'],
      );
    }
    const id = this.toSingleId(
      formValue['satellite_unit_id'] ?? formValue['satellite_unit_ids'],
    );
    return id != null ? [id] : [];
  }

  private getSubSatelliteUnitIdsFromForm(
    formValue: Record<string, unknown>,
    shipMode: boolean,
  ): number[] {
    if (shipMode) {
      return this.normalizeIdArray(
        formValue['sub_satellite_unit_ids'] ?? formValue['sub_satellite_unit_id'],
      );
    }
    const id = this.toSingleId(
      formValue['sub_satellite_unit_id'] ?? formValue['sub_satellite_unit_ids'],
    );
    return id != null ? [id] : [];
  }

  private idsKey(ids: number[]): string {
    return ids
      .slice()
      .sort((a, b) => a - b)
      .join(',');
  }

  private resolveDefaultFlag(): SubGroupFlag {
    if (isUserShipProcess()) return FLAG_SHIP;

    const processName = getUserProcessName().toLowerCase();
    if (processName.includes('ship')) return FLAG_SHIP;
    if (
      processName.includes('satellite') ||
      getUserSatelliteUnitId() != null
    ) {
      return FLAG_SATELLITE;
    }

    const user = getStoredUser();
    if (user?.['satellite_unit_id'] != null && user['satellite_unit_id'] !== '') {
      return FLAG_SATELLITE;
    }
    return FLAG_SATELLITE;
  }

  private flagLabel(value: unknown): string {
    const flag = this.normalizeFlag(value);
    if (flag === FLAG_SHIP) return 'Ship/Shore';
    if (flag === FLAG_SATELLITE) return 'Satellite';
    return '';
  }

  private normalizeFlag(value: unknown): SubGroupFlag | null {
    const v = String(value ?? '')
      .toLowerCase()
      .replace(/\s+/g, '');
    if (v === FLAG_SHIP || v.includes('ship')) return FLAG_SHIP;
    if (v === FLAG_SATELLITE || v.includes('satellite')) return FLAG_SATELLITE;
    return null;
  }

  private normalizeIdArray(value: unknown): number[] {
    if (!Array.isArray(value)) {
      if (value == null || value === '') return [];
      const n = Number(value);
      return Number.isNaN(n) ? [] : [n];
    }
    return value
      .map((item) => {
        if (item == null || item === '') return null;
        if (typeof item === 'object' && item !== null && 'id' in item) {
          return Number((item as { id: unknown }).id);
        }
        return Number(item);
      })
      .filter((id): id is number => id != null && !Number.isNaN(id));
  }

  private toSingleId(value: unknown): number | null {
    if (Array.isArray(value)) {
      const first = value[0];
      if (first == null || first === '') return null;
      if (typeof first === 'object' && first !== null && 'id' in first) {
        const n = Number((first as { id: unknown }).id);
        return Number.isNaN(n) ? null : n;
      }
      const n = Number(first);
      return Number.isNaN(n) ? null : n;
    }
    if (value == null || value === '') return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private normalizeList<T>(response: unknown): T[] {
    if (Array.isArray(response)) return response;
    if (response && typeof response === 'object') {
      const p = response as { data?: T[]; results?: T[] };
      return p.data ?? p.results ?? [];
    }
    return [];
  }
}
