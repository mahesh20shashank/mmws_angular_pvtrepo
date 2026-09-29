import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import {
  ControlContainer,
  FormGroupDirective,
  ReactiveFormsModule,
} from '@angular/forms';
import {
  EtmaKeyValueGroup,
  EtmaMatrixColumn,
  EtmaMatrixSection,
  EtmaMiscRow,
  EtmaObservationRow,
  EtmaSerialKeyValueRow,
  EtmaTableVariant,
} from './etma-proforma-table.types';
import { InputComponent } from '../../../ui/input.component';
import { CalenderComponent } from '../../../ui/calender.component';
import { FileUploadComponent } from '../../../ui/file-upload/file-upload.component';

@Component({
  selector: 'app-etma-proforma-table',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    InputComponent,
    CalenderComponent,
    FileUploadComponent,
  ],
  templateUrl: './etma-proforma-table.component.html',
  styleUrl: './etma-proforma-table.component.css',
  viewProviders: [
    {
      provide: ControlContainer,
      useExisting: FormGroupDirective,
    },
  ],
})
export class EtmaProformaTableComponent {
  @Input() legend = '';
  @Input() variant: EtmaTableVariant = 'matrix';
  @Input() minWidth = '700px';

  @Input() keyValueGroups: EtmaKeyValueGroup[] = [];
  @Input() serialRows: EtmaSerialKeyValueRow[] = [];

  @Input() columns: EtmaMatrixColumn[] = [];
  @Input() matrixSections: EtmaMatrixSection<unknown>[] = [];

  asObservationRow(row: unknown): EtmaObservationRow {
    return row as EtmaObservationRow;
  }

  asMiscRow(row: unknown): EtmaMiscRow {
    return row as EtmaMiscRow;
  }

  getStaticCellValue(row: unknown, column: EtmaMatrixColumn): string {
    const data = row as Record<string, unknown>;
    switch (column.cellType) {
      case 'static-ser':
        return String(data['ser'] ?? '');
      case 'static-protection':
        return String(data['protection'] ?? '');
      case 'static-meter':
        return String(data['meter'] ?? '');
      case 'static-tripping':
        return String(data['trippingValue'] ?? '');
      case 'static-observation':
        return String(data['observation'] ?? '');
      default:
        return '';
    }
  }

  getColumnCount(): number {
    return this.columns.length;
  }
}
