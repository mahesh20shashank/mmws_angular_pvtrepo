import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
// Old import:
// import { AddFormComponent } from '../../../../../../Components/add-form/add-form.component';
import { AddFormComponent } from '../../../../ui/add-form/add-form.component';
import { IconComponent } from '../../../../../../../shared/components/icon/icon.component';
import { ApiService } from '../../../../api.service';
import { ToastService } from '../../../../services/toast.service';
import {
  buildCatalogueInfoFromForm,
  buildSegCatalogueFormConfig,
  mapCatalogueRowToFormData,
} from '../seg-catalogue-form.shared';

const USE_DUMMY_TABLE_DATA = true;

@Component({
  selector: 'app-seg-edit-catalogue',
  standalone: true,
  imports: [CommonModule, AddFormComponent, IconComponent],
  templateUrl: './edit-catalogue.html',
})
export class SegEditCatalogueComponent implements OnInit {
  @ViewChild(AddFormComponent) catalogueForm?: AddFormComponent;

  readonly saveApiUrl = 'seg/create-catalogue/';

  catalogueId: string | null = null;
  editingItem: any = null;
  editFormData: Record<string, unknown> = {};
  formConfigForNewDetails: any[] = [];
  shipOptions: { label: string; value: string }[] = [];
  saving = false;
  pageReady = false;

  constructor(
    private readonly apiService: ApiService,
    private readonly toast: ToastService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}

  ngOnInit(): void {
    this.catalogueId = this.route.snapshot.paramMap.get('id');
    this.loadShipOptions();
    if (this.catalogueId) {
      this.loadItemData(this.catalogueId);
    } else {
      this.initializeForm({});
    }
  }

  private loadShipOptions(): void {
    this.apiService
      .getDropdownData('master/ships/', { labelKey: 'name', valueKey: 'id' })
      .subscribe({
        next: (ships: any) => {
          this.shipOptions = (ships || []).map((s: any) => ({
            label: s.label,
            value: String(s.value),
          }));
          this.rebuildFormConfig();
        },
        error: () => {
          this.shipOptions = [];
          this.rebuildFormConfig();
        },
      });
  }

  private rebuildFormConfig(): void {
    this.formConfigForNewDetails = buildSegCatalogueFormConfig(this.shipOptions);
  }

  loadItemData(id: string): void {
    if (!id) {
      this.goBack();
      return;
    }

    this.apiService.get<any>(`${this.saveApiUrl}${id}/`).subscribe({
      next: (res: any) => {
        const row = res?.data ?? res;
        this.applyRow(row);
      },
      error: () => {
        this.toast.showError('Failed to load catalogue details.');
        this.goBack();
      },
    });
  }

  private applyRow(row: any): void {
    this.editingItem = row;
    this.editFormData = mapCatalogueRowToFormData(row);
    this.pageReady = true;
  }

  initializeForm(formData: Record<string, unknown>): void {
    this.editFormData = formData;
    this.rebuildFormConfig();
    this.pageReady = true;
  }

  goBack(): void {
    this.router.navigate(['../'], { relativeTo: this.route });
  }

  save(): void {
    const form = this.catalogueForm?.form;
    if (!form) {
      return;
    }

    if (form.invalid) {
      this.toast.showError('Please fill all required fields.');
      Object.values(form.controls).forEach((c: any) => c.markAsTouched());
      return;
    }

    this.handleSubmit(form.getRawValue());
  }

  private handleSubmit(formData: any): void {
    if (this.saving) {
      return;
    }

    const catalogueInfo = buildCatalogueInfoFromForm(formData);
    const payload: Record<string, unknown> = { catalogueInfo };

    if (this.editingItem?.id) {
      payload['id'] = this.editingItem.id;
    }

    this.saving = true;
    this.apiService.post(this.saveApiUrl, payload).subscribe({
      next: (res: any) => {
        this.saving = false;
        this.toast.showSuccess(
          res?.message || 'Catalogue updated successfully',
        );
        this.goBack();
      },
      error: () => {
        this.saving = false;
        if (USE_DUMMY_TABLE_DATA) {
          this.toast.showSuccess('Catalogue updated (local dummy)');
          this.goBack();
          return;
        }
        this.toast.showError('Failed to update SEG catalogue data.');
      },
    });
  }
}
