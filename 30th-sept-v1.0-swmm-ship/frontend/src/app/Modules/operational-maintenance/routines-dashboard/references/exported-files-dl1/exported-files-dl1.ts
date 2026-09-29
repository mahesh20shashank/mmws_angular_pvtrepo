import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, inject, signal } from '@angular/core';
import { ColDef, CellCallbackParams } from 'ag-grid-community';
import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { NotificationService } from '../../../../../Core/services/notification/notification.service';
import { ModalComponent } from '../../../../../shared/components/modal/modal.component';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { GeneratedDl1ReportInnerRow, GeneratedDl1ReportRow } from './exported-files-dl1.model';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

// No dockyard-master endpoint exists yet — kept as a static list, same
// convention used elsewhere in this app (create-ra/create-dliii/etc).
const DOCKYARDS = ['ND (Mbi)', 'ND (V)', 'NSRY (Koc)', 'NSRY (Kar)', 'NSRY (Pbr)'];

const HELP_HTML = `
  <p class="mb-0">Lists previously generated DL-I reports with their dockyard, refit and row count. Click a row to view the routines it includes, or use Export ACCDB to download the report for the dockyard it was generated for.</p>
`;

// Mirrors Django's ems_generated_reports_list.html — previously generated DL 1 exports,
// each row exportable per-dockyard as an .accdb file.
@Component({
  selector: 'app-exported-files-dl1',
  standalone: true,
  imports: [CommonModule, MasterCard, ModalComponent, IconComponent, HelpGuidance, DataGrid ],
  templateUrl: './exported-files-dl1.html',
})
export class ExportedFilesDl1 implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly toastr = inject(NotificationService);
  private readonly call = inject(OperationalMaintenanceApi);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly dockyards = DOCKYARDS;
  rows: GeneratedDl1ReportRow[] = [];
  selectedRow = signal<GeneratedDl1ReportRow | null>(null);
  selectedRowDetails = signal<GeneratedDl1ReportInnerRow[]>([]);

  readonly columnDefs: ColDef[] = [
    {
      headerName: 'RA/DL Name',
      field: 'ra_dl_name',
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: CellCallbackParams) =>
        `<button type="button" class="text-[#1D96E9] underline">${params['value'] ?? ''}</button>`,
      onCellClicked: (event: CellCallbackParams) => this.viewDetails(event.data as GeneratedDl1ReportRow),
    },
    { headerName: 'Dockyard', field: 'dockyard_name', flex: 1, minWidth: 130 },
    { headerName: 'Refit', field: 'refit_type_name', flex: 1, minWidth: 130 },
    { headerName: 'Rows', field: 'total_dl_rows', flex: 1, minWidth: 90 },
    {
      headerName: 'Action',
      field: 'id',
      flex: 1,
      minWidth: 220,
      sortable: false,
      cellRenderer: () =>
        `<div class="flex flex-wrap gap-1">${this.dockyards
          .map(
            (d) =>
              `<button type="button" data-dockyard="${d}" class="px-2 py-0.5 rounded-full text-xs bg-white/10 border border-white/10 text-white" title="Export .accdb for ${d}">${d}</button>`,
          )
          .join('')}</div>`,
      onCellClicked: (event: CellCallbackParams) => {
        const target = (event as unknown as { event?: MouseEvent }).event?.target as HTMLElement | undefined;
        const dockyard = target?.closest?.('button')?.getAttribute('data-dockyard');
        if (dockyard) this.exportToDockyard(event.data as GeneratedDl1ReportRow, dockyard);
      },
    },
  ];

  readonly detailColumnDefs: ColDef[] = [
    { headerName: 'DL No', field: 'dl_no', flex: 1, minWidth: 110 },
    { headerName: 'Equipment Nomenclature', field: 'eq_name', flex: 1, minWidth: 200 },
    { headerName: 'Routine Name', field: 'routine_name', flex: 1, minWidth: 160 },
    { headerName: 'Description', field: 'description', flex: 1, minWidth: 220 },
  ];

  ngOnInit(): void {
    this.call.getGeneratedDl1Reports().subscribe({
      next: (res) => {
        this.rows = res.report_rows ?? [];
        this.cdr.detectChanges();
      },
      error: (err: unknown) => console.error('Failed to load generated DL1 reports', err),
    });
  }

  viewDetails(row: GeneratedDl1ReportRow): void {
    this.selectedRow.set(row);
    this.selectedRowDetails.set([]);
    this.call.getGeneratedDl1ReportInnerRows(row.id).subscribe({
      next: (res) => {
        this.selectedRowDetails.set(res.data ?? []);
        this.cdr.detectChanges();
      },
      error: (err: unknown) => console.error('Failed to load report detail rows', err),
    });
  }

  closeDetails(): void {
    this.selectedRow.set(null);
    this.selectedRowDetails.set([]);
  }

  exportToDockyard(row: GeneratedDl1ReportRow, dockyard: string): void {
    this.toastr.info(`Exporting ${row.ra_dl_name} for ${dockyard} (.accdb) — placeholder, no backend wired yet.`);
  }
}
