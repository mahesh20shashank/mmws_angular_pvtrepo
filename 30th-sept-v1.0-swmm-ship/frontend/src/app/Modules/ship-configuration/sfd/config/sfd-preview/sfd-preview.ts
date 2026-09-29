import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, computed, input, output } from '@angular/core';
import { SfdEquipment } from '../sfd-config.models';

interface PreviewField {
  label: string;
  key: keyof SfdEquipment;
  source: string

}

@Component({
  selector: 'app-sfd-preview',
  imports: [ButtonComponent],
  templateUrl: './sfd-preview.html',
  styleUrl: './sfd-preview.css',
})
export class SfdPreview {

  readonly previewData = input<SfdEquipment | null>(null);

  readonly fields: PreviewField[] = [
    // { label: 'SFD Code', key: 'sfd_code', source: "CMMS" },
    // { label: 'Equipment Name', key: 'equipment_name', source: "CMMS" },
    // { label: 'Nomenclature', key: 'nomenclature', source: "CMMS" },
    // { label: 'Maintop No', key: 'maintopNo', source: "CMMS" },
    // { label: 'System', key: 'system', source: "CMMS" },
    // { label: 'Sub Department', key: 'sub_department', source: "CMMS" },
    // { label: 'Location', key: 'location', source: "USER" },
    // { label: 'Quantity Fitted', key: 'qty_fitted', source: "USER" },
    // { label: 'Fitment Date', key: 'fitment_date', source: "CMMS" },
    // { label: 'Status', key: 'status', source: "USER" },
  ];

  readonly previewFields = computed(() =>
    this.fields.map(field => ({
      ...field,
      value: this.previewData()?.[field.key] ?? '-',
    }))
  );

  closed = output<void>();

  closeModal(): void {
    this.closed.emit();
  }
}
