import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, inject, signal, computed, Input, ChangeDetectorRef, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';

import { Router } from '@angular/router';
import { MultiDartService } from './multi-dart.service';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../../Core/services/notification/notification.service';

import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DataGrid, ActionRendererComponent, GridStatusChipRenderer } from '../../../../shared/components';
import { ExportToolbar, ExportKind } from '../../../../shared/components/export-toolbar/export-toolbar';
import { ColDef } from 'ag-grid-community';
import { OpmMultipleDraftRow } from '../opm-actions.models';

import { ReportExportService } from '../../../../Core/services/export/generic-export.service';
import { SpareSelectionModal } from '../../../../shared/components/spare-selection-modal/spare-selection-modal';

import { HelpGuidance } from '../../../../shared/components/help-guidance/help-guidance';
import { FormModal } from '../../../../shared/components/form-modal/form-modal';
import { DropdownOption, SelectInput } from '../../../../shared/components/select-input/select-input';

@Component({
  selector: 'app-opm-multi-dart',
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, DataGrid, ExportToolbar, SpareSelectionModal, HelpGuidance, FormModal, SelectInput, ButtonComponent],
  templateUrl: './opm-multi-dart.component.html',
  styleUrl: './opm-multi-dart.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmMultiDartComponent implements OnInit {
  readonly helpHtml = `
    <h3>What this page is for</h3>
    <p>Raising many defects at once, instead of filling the Create Defect form over and over. <strong>One row here becomes
        one DART.</strong></p>

    <h3>There are two ways to work. Pick one.</h3>
    <p>They do not mix within a batch, because importing a file <strong>replaces everything on the page.</strong></p>

    <div class="act-help__grid">
      <div class="act-help__card">
        <h3>A — Fill in Excel, then import</h3>
        <p><em>Best when you are away from a computer, or several people are collecting defects on paper first.</em></p>
        <ul>
          <li><strong>Download Template</strong> — Download an Excel template to complete offline. If rows are already on
            screen, they are included exactly as they appear. If no rows exist, you can choose how many blank rows to
            download.</li>
          <li><strong>Import Excel</strong> — Load a completed Excel template. This will replace every row currently in
            the grid.</li>
        </ul>
      </div>

      <div class="act-help__card">
        <h3>B — Fill in on this page</h3>
        <p><em>Best for a handful of defects, or when you want the drop downs and checks as you type.</em></p>
        <ul>
          <li><strong>Create Multiple DARTs</strong> — Pick an equipment and specify how many DARTs you want for it. Add
            that many rows at once without removing the rows already in the grid.</li>
          <li><strong>Add Row</strong> — Add one empty row and fill in the DART details manually.</li>
        </ul>
      </div>
    </div>

    <h3>Other Actions</h3>
    <ul>
      <li><strong>Save Drafts</strong> — Save this batch as a draft so anyone in your department can continue working on
        it later. No DART is raised at this stage.</li>
      <li><strong>Save Multiple DART</strong> — Raise every selected row as a DART. You will be asked to confirm and
        provide the maintenance period before saving.</li>
      <li><strong>Back to Drafts</strong> — Return to the list of saved drafts.</li>
    </ul>

    <h3>Drafts are shared with your department</h3>
    <ul>
      <li>This page opens on your department's <strong>saved drafts</strong>. Anyone in your department can open one and
        carry on where the last person stopped.</li>
      <li>While you have a draft open it is marked as being edited by you. Someone else opening it sees your name and can
        <strong>take over</strong> if you have finished with it.
      </li>
      <li>A draft is only working notes. <strong>Nothing reaches the database until you save.</strong></li>
    </ul>

    <h3>About the DART No column</h3>
    <p>Every row is given a DART number as soon as it appears, so you can see and print it. That number is <strong>held
        for you, not yet issued</strong>, and it is never in the Excel file. The real number is confirmed the moment you
      save, and if someone else happened to take it in the meantime your row is told which number it actually received.
    </p>

    <h3>Picking the right equipment</h3>
    <p>Go by the <strong>Equipment Nomenclature</strong>, not the code. Two equipment can share one code and be told apart
      only by their nomenclature — <em>FGTR</em> is the forward gas turbine room and <em>AGTR</em> the aft one, so
      <em>FUEL CENTRIFUGE FGTR</em> and <em>FUEL CENTRIFUGE AGTR</em> are two different machines.
    </p>

    <h3>Spares</h3>
    <p>Set <strong>Spares Request</strong> to Yes on a row and a <strong>Link Spares</strong> button appears. Pick the
      spares exactly as you would on the single DART form — they reach the storekeeper the same way. A row marked Yes
      cannot be saved until its spares are linked.</p>
  `;

  private readonly multiDartService = inject(MultiDartService);
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  private readonly notification = inject(NotificationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly exportService = inject(ReportExportService);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  ngOnInit() {
    this.multiDartService.getOptions().subscribe({
      next: (res: any) => {
        if (res.equipment_list) {
          this.multiEquipmentOptionsFull = res.equipment_list.map((e: any) => {
            const label = e.equipment_name || e.label || e.name || e;
            let id = e.equipment_code || e.id || e.value;
            if (!id && typeof label === 'string' && /^\d+\s*-/.test(label)) {
              id = parseInt(label.split('-')[0].trim(), 10);
            } else if (!id) id = label;
            return { id, label };
          });
          this.multiEquipmentOptions = this.multiEquipmentOptionsFull.map(e => e.label);
        }

        if (res.nomenclature_list) {
          this.multiNomenclatureOptionsFull = res.nomenclature_list.map((e: any) => {
            const label = e.nomenclature_name || e.label || e.name || e;
            let id = e.nomenclature_id || e.id || e.value;
            if (!id && typeof label === 'string' && /^\d+\s*-/.test(label)) {
              id = parseInt(label.split('-')[0].trim(), 10);
            } else if (!id) id = label;
            return { id, label };
          });
          this.multiNomenclatureOptions = this.multiNomenclatureOptionsFull.map(e => e.label);
        }

        if (res.symptom_list) {
          this.multiSymptomOptionsFull = res.symptom_list.map((e: any) => ({ id: e.id || e.value || e.label || e, label: e.label || e.name || e }));
          this.multiSymptomOptions = this.multiSymptomOptionsFull.map(e => e.label);
        }
        if (res.severity_list) {
          this.multiSeverityOptionsFull = res.severity_list.map((e: any) => ({ id: e.id || e.value || e.label || e, label: e.label || e.name || e }));
          this.multiSeverityOptions = this.multiSeverityOptionsFull.map(e => e.label);
        }
        if (res.assistance_list) {
          this.multiReqAssistanceOptionsFull = res.assistance_list.map((e: any) => ({ id: e.id || e.value || e.label || e, label: e.label || e.name || e }));
          this.multiReqAssistanceOptions = this.multiReqAssistanceOptionsFull.map(e => e.label);
        }
        if (res.remark_list) {
          this.multiSsRemarksOptionsFull = res.remark_list.map((e: any) => ({ id: e.id || e.value || e.label || e, label: e.label || e.name || e }));
          this.multiSsRemarksOptions = this.multiSsRemarksOptionsFull.map(e => e.label);
        }
        if (res.draft_rows) {
          this.multiDraftRows = res.draft_rows.map((d: any) => ({
            id: String(d.id), draftName: d.name, rows: d.row_count, createdBy: d.created_by,
            lastUpdatedBy: d.last_updated_by, lastUpdated: d.updated_at, status: d.locked ? 'Submitted' : 'Draft',
          }));
        }
        this.cdr.markForCheck();
      },
      error: (err: any) => console.error('Failed to load options', err)
    });
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  @Input() view: "list" | "add" | "addMultiple" | "newMultiple" | "raiseRA" | "approval" | "approvalDetail" | "guarantee" = 'addMultiple';

  goBack() {
    this.location.back();
  }

  @Input() multiEquipmentOptionsFull: { id: string | number, label: string }[] = [];
  @Input() multiEquipmentOptions: string[] = [];
  @Input() multiNomenclatureOptionsFull: { id: string | number, label: string }[] = [];
  @Input() multiNomenclatureOptions: string[] = [];

  @Input() multiSymptomOptions: string[] = [];
  @Input() multiSymptomOptionsFull: { id: string | number, label: string }[] = [];
  @Input() multiSeverityOptions: string[] = [];
  @Input() multiSeverityOptionsFull: { id: string | number, label: string }[] = [];
  @Input() multiReqAssistanceOptions: string[] = [];
  @Input() multiReqAssistanceOptionsFull: { id: string | number, label: string }[] = [];
  @Input() multiSsRemarksOptions: string[] = [];
  @Input() multiSsRemarksOptionsFull: { id: string | number, label: string }[] = [];

  // DropdownOption views of the arrays above, for app-select-input — the row state still
  // stores/updates the plain label string (via updateMultipleRow), so `value` mirrors `label`
  // exactly like the native <select>'s [value]="e.label" did.
  get equipmentDropdownOptions(): DropdownOption[] {
    return this.multiEquipmentOptionsFull.map(e => ({ label: e.label, value: e.label }));
  }
  nomenclatureDropdownOptionsFor(row: { nomenclatureOptions?: { id: string | number; label: string }[] }): DropdownOption[] {
    return (row.nomenclatureOptions || this.multiNomenclatureOptionsFull).map(e => ({ label: e.label, value: e.label }));
  }
  get symptomDropdownOptions(): DropdownOption[] {
    return this.multiSymptomOptions.map(label => ({ label, value: label }));
  }
  get severityDropdownOptions(): DropdownOption[] {
    return this.multiSeverityOptions.map(label => ({ label, value: label }));
  }
  get reqAssistanceDropdownOptions(): DropdownOption[] {
    return this.multiReqAssistanceOptions.map(label => ({ label, value: label }));
  }
  get ssRemarksDropdownOptions(): DropdownOption[] {
    return this.multiSsRemarksOptions.map(label => ({ label, value: label }));
  }
  readonly sparesRequestDropdownOptions: DropdownOption[] = [
    { label: 'No', value: 'No' },
    { label: 'Yes', value: 'Yes' },
  ];

  // id-keyed DropdownOption views for the "Create Multiple DARTs" modal pickers — these use
  // the equipment/nomenclature id as the value (unlike the grid rows above, which key by label).
  get multiDartsEqpNameOptions(): DropdownOption[] {
    return this.multiEquipmentOptionsFull.map(e => ({ label: e.label, value: e.id }));
  }
  get multiDartsEqpNomenclatureOptions(): DropdownOption[] {
    return this.multiDartsModalNomenclatureOptions().map(e => ({ label: e.label, value: e.id }));
  }
  toIdString(value: unknown): string {
    return value == null ? '' : String(value);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  @Input() multiDraftRows: any[] = [];

  readonly searchQuery = signal('');

  get filteredDraftRows() {
    const query = this.searchQuery().toLowerCase();
    if (!query) return this.multiDraftRows;
    return this.multiDraftRows.filter((row: OpmMultipleDraftRow) =>
      (row.draftName && String(row.draftName).toLowerCase().includes(query)) ||
      (row.createdBy && String(row.createdBy).toLowerCase().includes(query)) ||
      (row.lastUpdatedBy && String(row.lastUpdatedBy).toLowerCase().includes(query)) ||
      (row.status && String(row.status).toLowerCase().includes(query))
    );
  }

  onExport(kind: ExportKind): void {
    this.exportService.export(
      kind,
      'Multiple DART Drafts',
      this.multiDraftColumnDefs,
      this.filteredDraftRows,
      'Multiple DART Drafts'
    );
  }

  copyData(): void {
    void this.exportService.copyRows(this.exportService.normalizeColumns(this.multiDraftColumnDefs), this.filteredDraftRows);
  }

  multipleHelpOpen = signal(true);
  readonly newMultipleRows = signal<{
    dartNo: string; sNo: string; equipmentName: string; eqptNomenclature: string;
    subDept: string; defectDate: string; scheduledDate: string; symptoms: string;
    severity: string; reqAssistance: string; defectiveComponent: string;
    defectDescription: string; ssRemarks: string; sparesRequest: string;
    nomenclatureOptions?: { id: string | number, label: string }[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    selectedSpares?: any[];
    status?: 'RAISED';
  }[]>([]);

  readonly multiPageSize = signal(10);
  readonly multiPage = signal(1);
  hoveredDart: number | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  isRowValid(row: any): boolean {
    if (!row) return false;
    if (!row.equipmentName || row.equipmentName === '—' || row.equipmentName === '- select -') return false;
    if (!row.eqptNomenclature || row.eqptNomenclature === '—' || row.eqptNomenclature === '- select -') return false;
    if (!row.symptoms || row.symptoms === '—' || row.symptoms === '- select -') return false;
    if (!row.severity || row.severity === '—' || row.severity === '- select -') return false;
    if (!row.defectDescription || !row.defectDescription.trim()) return false;
    if (row.sparesRequest === 'Yes' && (!row.selectedSpares || row.selectedSpares.length === 0)) return false;
    return true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public isInvalidOption(value: string, options: any[] | undefined): boolean {
    if (!value || value === '—' || !options || options.length === 0) return false;
    if (typeof options[0] === 'string') {
      return !options.includes(value);
    } else {
      return !options.some(o => o.label === value);
    }
  }

  public blankMultipleRow() {
    return {
      dartNo: '—', sNo: '', equipmentName: '', eqptNomenclature: '',
      subDept: '', defectDate: '', scheduledDate: '', symptoms: '',
      severity: '', reqAssistance: '', defectiveComponent: '',
      defectDescription: '', ssRemarks: '', sparesRequest: '',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      selectedSpares: [] as any[]
    };
  }

  readonly multiDartsModalOpen = signal(false);
  readonly multiDartsEqpName = signal('');
  readonly multiDartsEqpNomenclature = signal('');
  readonly multiDartsCount = signal(1);
  readonly multiDartsModalNomenclatureOptions = signal<{ id: string | number, label: string }[]>([]);
  readonly multiDartsList = signal<{ equipmentName: string; equipment_code: unknown; eqptNomenclature: string; nomenclature_id: string | number; count: number; nomenclatureOptions?: { id: string | number, label: string }[] }[]>([]);

  openCreateMultipleDartsModal(): void {
    if (!this.multiNomenclatureOptionsFull.length) {
      this.multiNomenclatureOptionsFull = this.multiNomenclatureOptions.map((label, i) => ({ id: i + 1, label }));
    }
    if (!this.multiEquipmentOptionsFull.length && this.multiEquipmentOptions.length) {
      this.multiEquipmentOptionsFull = this.multiEquipmentOptions.map((label, i) => ({ id: i + 1, label }));
    }
    this.multiDartsEqpName.set('');
    this.multiDartsEqpNomenclature.set('');
    this.multiDartsCount.set(1);
    this.multiDartsList.set([]);
    this.multiDartsModalNomenclatureOptions.set([]);
    this.multiDartsModalOpen.set(true);
  }

  onMultiEqpNameChange(value: string): void {
    this.multiDartsEqpName.set(value);
    this.multiDartsEqpNomenclature.set('');
    this.multiDartsModalNomenclatureOptions.set([]);

    if (value) {
      const eqp = this.multiEquipmentOptionsFull.find(e => String(e.id) === value);
      const code = eqp?.id;
      if (code) {
        this.multiDartService.getEquipmentObjects(code).subscribe({
          next: (res) => {
            const equipments = res?.['ship_equipments'];
            if (Array.isArray(equipments)) {
              const options = (equipments as { id: string | number; nomenclature: string }[]).map(item => ({
                id: item.id,
                label: item.nomenclature
              }));
              this.multiDartsModalNomenclatureOptions.set(options);
            }
          },
          error: (err) => console.error('Error fetching nomenclature for modal', err)
        });
      }
    }
  }

  closeCreateMultipleDartsModal(): void {
    this.multiDartsModalOpen.set(false);
  }

  addToMultiDartsList(): void {
    const eqpId = this.multiDartsEqpName().trim();
    if (!eqpId) { this.notification.info('Enter an Equipment Name first'); return; }

    const nomId = this.multiDartsEqpNomenclature().trim();

    const eqp = this.multiEquipmentOptionsFull.find(e => String(e.id) === eqpId);
    const nom = this.multiDartsModalNomenclatureOptions().find(e => String(e.id) === nomId);

    this.multiDartsList.update(list => [
      ...list,
      {
        equipmentName: eqp ? eqp.label : eqpId,
        equipment_code: eqp ? eqp.id : eqpId,
        eqptNomenclature: nom ? nom.label : nomId,
        nomenclature_id: nom ? nom.id : nomId,
        count: this.multiDartsCount(),
        nomenclatureOptions: this.multiDartsModalNomenclatureOptions()
      }
    ]);
    this.multiDartsEqpName.set('');
    this.multiDartsEqpNomenclature.set('');
    this.multiDartsCount.set(1);
  }

  removeFromMultiDartsList(index: number): void {
    this.multiDartsList.update(list => list.filter((_, i) => i !== index));
  }

  createMultipleDartsRows(): void {
    const list = this.multiDartsList();
    if (!list.length) { this.notification.info('Add at least one equipment to the list'); return; }

    const selections = list.map(entry => ({
      equipment_code: entry.equipment_code,
      nomenclature_id: entry.nomenclature_id,
      count: entry.count
    }));

    const existingNumbers = this.newMultipleRows()
      .map(row => row.dartNo)
      .filter(no => no && no !== '—');


    this.multiDartService.getEquipmentRows({
      selections: selections,
      existing_numbers: existingNumbers
    }).subscribe({
      next: (res) => {
        let newRowsData = Array.isArray(res) ? res : (res.rows || res.data || [res]);
        if (!Array.isArray(newRowsData)) newRowsData = [newRowsData];

        // Create a flat queue of what was requested in the modal
        const requestedQueue: typeof list = [];
        list.forEach(item => {
          for (let i = 0; i < item.count; i++) {
            requestedQueue.push(item);
          }
        });

        let newRowCounter = 0;


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newRows = newRowsData.map((data: any) => {
          // Check if this is an existing row from the grid
          const existingRow = this.newMultipleRows().find(r => r.dartNo === data.dartNo && data.dartNo !== '—');

          let eqName = data.equipmentName || data.equipment_code || data.item || '';
          let nomName = data.eqptNomenclature || data.nomenclature_id || data.nomenclature || '';
          let nomOptions = existingRow?.nomenclatureOptions;

          // Greedily apply modal selections to blank rows (or new rows)
          if ((!existingRow || !existingRow.equipmentName || existingRow.equipmentName === '—') && requestedQueue.length > 0) {
            // If the user provided fewer modal selections than there are blank rows,
            // we repeat the very last selection to aggressively fill all remaining blank rows.
            const entryIndex = Math.min(newRowCounter, requestedQueue.length - 1);
            const originalEntry = requestedQueue[entryIndex];
            if (originalEntry) {
              eqName = originalEntry.equipmentName;
              nomName = originalEntry.eqptNomenclature;
              nomOptions = originalEntry.nomenclatureOptions || [];
            }
            newRowCounter++;
          } else if (existingRow) {
            // Preserve existing row's accurate labels and options
            eqName = existingRow.equipmentName || eqName;
            nomName = existingRow.eqptNomenclature || nomName;
          }

          return {
            ...this.blankMultipleRow(),
            ...(existingRow || {}), // restore existing data if any
            ...data, // merge backend data
            dartNo: data.dartNo || data.dart_no || data.number || data.dart || '—',
            equipmentName: eqName,
            eqptNomenclature: nomName,
            nomenclatureOptions: nomOptions
          };
        });

        this.newMultipleRows.set(newRows);

        // Fetch nomenclature details for the newly created rows
        const uniqueEntries = Array.from(new Map(list.map(e => [e.nomenclature_id, e])).values());
        uniqueEntries.forEach(entry => {
          if (entry.nomenclature_id) {
            this.multiDartService.get_nomenclature_details(entry.nomenclature_id).subscribe({
              next: (detailRes) => {
                const dData = detailRes?.data || detailRes;
                this.updateRowsWithNomenclatureDetails(entry, dData);
              },
              error: (err) => console.error('Error fetching nomenclature details for new rows', err)
            });
          }
        });

        this.multiDartsList.set([]); // Clear list so it doesn't accumulate
        this.multiDartsModalOpen.set(false);
        this.notification.success(`${newRows.length} row${newRows.length > 1 ? 's' : ''} created successfully`);
        // Back to page 1 — landing on the last page (previous behavior) hid the newly
        // created rows off-screen whenever they didn't all fit on one page.
        this.multiPage.set(1);
      },
      error: (err) => {
        this.notification.error('Failed to create rows from server');
        console.error(err);

        const rows: ReturnType<typeof this.blankMultipleRow>[] = [];
        for (const entry of list) {
          for (let i = 0; i < entry.count; i++) {
            rows.push({ ...this.blankMultipleRow(), equipmentName: entry.equipmentName, eqptNomenclature: entry.eqptNomenclature });
          }
        }
        this.newMultipleRows.set(rows);
        this.multiDartsModalOpen.set(false);
        this.notification.success(`Local fallback: ${rows.length} row${rows.length > 1 ? 's' : ''} added`);
        this.multiPage.set(1);
      }
    });
  }

  // New Multiple DART form view
  readonly newMultipleDraftName = signal('');
  readonly activeToolbarAction = signal<string>('');
  // Import Excel modal
  readonly importExcelModalOpen = signal(false);
  readonly importExcelCount = signal<number | null>(null);
  readonly importExcelFile = signal<File | null>(null);
  readonly importExcelError = signal<string>('');

  // Spares modal
  readonly showSpareModal = signal(false);
  readonly activeSpareRowIndex = signal<number | null>(null);
  readonly currentSpareSource = signal<'defect' | 'guarantee' | 'aber'>('defect');
  readonly activeRowSelectedSpares = computed(() => {
    const idx = this.activeSpareRowIndex();
    if (idx === null) return [];
    return this.newMultipleRows()[idx]?.selectedSpares || [];
  });

  openImportExcelModal(): void {
    this.importExcelCount.set(null);
    this.importExcelFile.set(null);
    this.importExcelError.set('');
    this.importExcelModalOpen.set(true);
  }

  closeImportExcelModal(): void {
    this.importExcelModalOpen.set(false);
  }

  setImportExcelFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.importExcelFile.set(input.files?.[0] ?? null);
  }

  confirmImportExcel(): void {
    const file = this.importExcelFile();
    const count = this.importExcelCount();
    this.importExcelError.set('');

    if (!file) {
      this.importExcelError.set('Please choose a file first.');
      return;
    }
    if (!count) {
      this.importExcelError.set('Please enter the number of DARTs.');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('declared_count', String(count));

    // skipFeedback: global feedbackInterceptor must not swallow this error —
    // we show it inline inside the modal via importExcelError signal.
    this.multiDartService.importExcel(formData).subscribe({
      next: (res) => this.handleImportExcelSuccess(res),
      error: (err: { error?: unknown; message?: string }) => {
        if (err && err.error) {
          let errBody = err.error;
          if (typeof errBody === 'string') {
            try { errBody = JSON.parse(errBody); } catch { /* non-JSON, use string */ }
          }
          const rec = errBody as Record<string, unknown>;
          const raw = rec?.['error'] ?? rec?.['message'] ?? errBody;
          const msg = typeof raw === 'string' && raw.trim() ? raw : JSON.stringify(errBody);
          this.importExcelError.set(msg);
        } else {
          this.importExcelError.set(err.message || 'An error occurred while importing. Please try again.');
        }
      }
    });
  }

  private handleImportExcelSuccess(res: unknown): void {
    let parsedRes: Record<string, unknown> = res as Record<string, unknown>;
    if (typeof res === 'string') {
      try { parsedRes = JSON.parse(res); } catch { /* non-JSON body, use as-is */ }
    }

    if (parsedRes && parsedRes['success'] === false) {
      const raw = parsedRes['error'] ?? parsedRes['message'] ?? parsedRes;
      const msg = typeof raw === 'string' ? raw : JSON.stringify(raw);
      this.importExcelError.set(msg);
      return;
    }
    if (parsedRes && parsedRes['error'] && !parsedRes['rows'] && !parsedRes['data']) {
      const raw = parsedRes['error'];
      const msg = typeof raw === 'string' ? raw : JSON.stringify(raw);
      this.importExcelError.set(msg);
      return;
    }

    let rawRows: unknown = Array.isArray(parsedRes)
      ? parsedRes
      : (parsedRes['rows'] ?? parsedRes['data'] ?? parsedRes['darts'] ?? []);
    if (!Array.isArray(rawRows)) rawRows = [];

    const mappedRows = (rawRows as Record<string, unknown>[]).map(d => this.mapImportedRow(d));

    if (mappedRows.length === 0) {
      this.importExcelError.set('Import succeeded but no rows were returned. Check your Excel file has data.');
      return;
    }

    this.newMultipleRows.set(mappedRows);
    this.multiPage.set(1); // always go back to page 1 so user sees the rows
    this.importExcelModalOpen.set(false);
    this.notification.success(`${mappedRows.length} row${mappedRows.length > 1 ? 's' : ''} imported successfully`);

    const uniqueEquipments = Array.from(new Set(mappedRows.map(r => r.equipmentName).filter(Boolean)));
    this.fetchNomenclaturesForImportedRows(uniqueEquipments);
  }

  private extractValue(d: Record<string, unknown>, possibleKeys: string[]): string {
    for (const pk of possibleKeys) {
      const cleanPk = pk.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      for (const key of Object.keys(d)) {
        const cleanKey = key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
        if (cleanKey === cleanPk) {
          const val = String(d[key] ?? '').trim();
          if (val) return val;
        }
      }
    }
    return '';
  }

  private mapImportedRow(d: Record<string, unknown>) {
    // Robust key matching for equipment (prioritize code)
    const eqpRaw = this.extractValue(d, ['equipment_code', 'EquipmentCode', 'EquipmentName', 'equipment_name']);
    let eqp = String(eqpRaw).trim();
    const eqpMatch = this.multiEquipmentOptionsFull.find(o => String(o.id).trim() === eqp || String(o.label).trim().toLowerCase() === eqp.toLowerCase());
    if (eqpMatch) eqp = eqpMatch.label;

    // Robust key matching for nomenclature (prioritize id)
    const nomRaw = this.extractValue(d, ['nomenclature_id', 'nomenclatureid', 'EqptNomenclature', 'nomenclature', 'Nomenclature']);
    let nom = String(nomRaw).trim();
    const nomMatch = this.multiNomenclatureOptionsFull.find(o => String(o.id).trim() === nom || String(o.label).trim().toLowerCase() === nom.toLowerCase());
    if (nomMatch) nom = nomMatch.label;

    const symRaw = this.extractValue(d, ['symptom_id', 'symptoms', 'symptom']);
    let sym = String(symRaw).trim();
    const symMatch = this.multiSymptomOptionsFull.find(o => String(o.id).trim() === sym || String(o.label).trim().toLowerCase() === sym.toLowerCase());
    if (symMatch) sym = symMatch.label;

    const sevRaw = this.extractValue(d, ['severity_id', 'severity']);
    let sev = String(sevRaw).trim();
    const sevMatch = this.multiSeverityOptionsFull.find(o => String(o.id).trim() === sev || String(o.label).trim().toLowerCase() === sev.toLowerCase());
    if (sevMatch) sev = sevMatch.label;

    const reqRaw = this.extractValue(d, ['assistance_id', 'reqAssistance', 'req_assistance', 'assistance', 'reqassistance']);
    let req = String(reqRaw).trim();
    const reqMatch = this.multiReqAssistanceOptionsFull.find(o => String(o.id).trim() === req || String(o.label).trim().toLowerCase() === req.toLowerCase());
    if (reqMatch) req = reqMatch.label;

    const remRaw = this.extractValue(d, ['remark_id', 'ssRemarks', 'ss_remarks', 'remarks', 'remark']);
    let rem = String(remRaw).trim();
    const remMatch = this.multiSsRemarksOptionsFull.find(o => String(o.id).trim() === rem || String(o.label).trim().toLowerCase() === rem.toLowerCase());
    if (remMatch) rem = remMatch.label;

    const component = this.extractValue(d, ['component', 'defectiveComponent']);
    const description = this.extractValue(d, ['description', 'defectDescription']);

    const dartNo = this.extractValue(d, ['dart_number', 'dartNo']);
    const subDept = this.extractValue(d, ['sub_department', 'subDept']);
    const defectDate = this.extractValue(d, ['defect_date', 'defectDate']);
    const scheduledDate = this.extractValue(d, ['scheduled_date', 'scheduledDate']);
    const sparesRequest = this.extractValue(d, ['spares_required', 'sparesRequest']);

    return {
      ...this.blankMultipleRow(),
      dartNo: dartNo && dartNo !== '-' ? dartNo : '—',
      sNo: String(d['s_no'] ?? d['sNo'] ?? ''),
      equipmentName: eqp || '',
      eqptNomenclature: nom || '',
      nomenclatureOptions: nom ? [{ id: nom, label: nom }] : undefined,
      subDept: subDept || '—',
      defectDate: defectDate || '',
      scheduledDate: scheduledDate || '',
      symptoms: sym || '',
      severity: sev || '',
      reqAssistance: req || '',
      defectiveComponent: component,
      defectDescription: description,
      ssRemarks: rem || '',
      sparesRequest: sparesRequest || 'No',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateRowsWithNomenclatureDetails(entry: any, dData: any): void {
    this.newMultipleRows.update(rows =>
      rows.map(r => {
        if (r.equipmentName === entry.equipmentName && r.eqptNomenclature === entry.eqptNomenclature) {
          return {
            ...r,
            subDept: dData.sub_department || dData.subDept || r.subDept,
            ...dData
          };
        }
        return r;
      })
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private updateRowsWithNomenclatureOptions(eqpName: string, code: string | number, options: any[]): void {
    this.newMultipleRows.update(rows =>
      rows.map(row => {
        if (row.equipmentName === eqpName || row.equipmentName === String(code)) {
          let matchingNom = row.eqptNomenclature;
          if (matchingNom) {
            const match = options.find(o => o.label.trim().toLowerCase() === matchingNom.trim().toLowerCase() || String(o.id).trim() === matchingNom.trim());
            if (match) matchingNom = match.label;
          }
          return { ...row, nomenclatureOptions: options, eqptNomenclature: matchingNom };
        }
        return row;
      })
    );
  }

  private fetchNomenclaturesForImportedRows(uniqueEquipments: string[]): void {
    for (const eqpName of uniqueEquipments) {
      // Find the equipment code to fetch nomenclatures
      const eqpMatch = this.multiEquipmentOptionsFull.find(e => e.label === eqpName || String(e.id) === eqpName);
      const code = eqpMatch?.id || eqpName;
      if (code) {
        this.multiDartService.getEquipmentObjects(code).subscribe({
          next: (res) => {
            const equipments = res?.['ship_equipments'];
            if (Array.isArray(equipments)) {
              const options = (equipments as { id: string | number; nomenclature: string }[]).map(item => ({
                id: item.id,
                label: item.nomenclature
              }));
              this.updateRowsWithNomenclatureOptions(eqpName, code, options);
            }
          },
          error: (err) => console.error('Error fetching nomenclature options in background:', err)
        });
      }
    }
  }

  // Save Draft modal
  readonly saveDraftModalOpen = signal(false);
  readonly saveDraftName = signal('');

  openSaveDraftModal(): void {
    this.saveDraftName.set('');
    this.saveDraftModalOpen.set(true);
  }

  closeSaveDraftModal(): void {
    this.saveDraftModalOpen.set(false);
  }

  confirmSaveDraft(): void {
    const name = this.saveDraftName().trim();
    if (!name) { this.notification.info('Enter a draft name'); return; }

    const payload = {
      draft_id: null,
      name: name,
      rows: this.newMultipleRows().map(row => ({
        ...row,
        spares: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          obs: (row.selectedSpares || []).map((s: any) => ({
            pattern: s.patternNo || 'None',
            description: s.itemDesc || s.item_desc || '',
            qty: s.qtyRequired || 1,
            inventory_type: s.inventoryType || s.sourceTab || 'OBS'
          })),
          ilms: [],
          pil: []
        }
      }))
    };


    this.multiDartService.draftSave(payload).subscribe({
      next: (res) => {
        this.notification.success(`Draft "${name}" saved. Anyone in your department can open and continue it.`);
        this.saveDraftModalOpen.set(false);
        this.location.back();

        // Update the list immediately to show the new draft
        this.multiDraftRows = [
          {
            id: String(res.draft_id || res.id || Date.now()),
            draftName: name,
            rows: payload.rows.length,
            createdBy: 'Engineering HOD',
            lastUpdatedBy: 'Engineering HOD',
            lastUpdated: 'Just now',
            status: 'Draft'
          },
          ...this.multiDraftRows
        ];
      },
      error: (err) => {
        console.error('Failed to save draft', err);
        // Fallback to local UI update
        this.notification.success(`Draft "${name}" saved. Anyone in your department can open and continue it.`);
        this.saveDraftModalOpen.set(false);
        this.location.back();
        this.multiDraftRows = [
          {
            id: String(Date.now()),
            draftName: name,
            rows: payload.rows.length,
            createdBy: 'Engineering HOD',
            lastUpdatedBy: 'Engineering HOD',
            lastUpdated: 'Just now',
            status: 'Draft'
          },
          ...this.multiDraftRows
        ];
      }
    });
  }

  // Download Template modal
  readonly downloadTemplateModalOpen = signal(false);
  readonly downloadTemplateRows = signal(2);

  openDownloadTemplateModal(): void {
    this.downloadTemplateRows.set(2);
    this.downloadTemplateModalOpen.set(true);
  }

  closeDownloadTemplateModal(): void {
    this.downloadTemplateModalOpen.set(false);
  }

  confirmDownloadTemplate(): void {
    const rowCount = this.downloadTemplateRows();

    const emptyRow = {
      equipment_code: "",
      nomenclature: "",
      defect_date: "",
      scheduled_date: "",
      symptom_id: null,
      severity_id: null,
      assistance_id: null,
      component: "",
      description: "",
      remark_id: null,
      spares_required: ""
    };
    const rows = Array.from({ length: rowCount }).map(() => ({ ...emptyRow }));

    this.multiDartService.downloadTemplate({ rows })
      .subscribe({
        next: (blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'SWMM_Multiple_DART_import_Tempale.xlsx';
          a.click();
          window.URL.revokeObjectURL(url);

          this.notification.success(`Downloaded template with ${rowCount} rows`);
          this.closeDownloadTemplateModal();
        },
        error: (err) => {
          console.error('Failed to download template', err);
          this.notification.error('Failed to download template');
        }
      });
  }

  // --- Checkbox selection for new multiple DART table ---
  readonly selectedMultipleRows = signal<Set<number>>(new Set());
  readonly selectedMultipleCount = computed(() => this.selectedMultipleRows().size);

  toggleMultipleRowSelection(index: number): void {
    this.selectedMultipleRows.update(sel => {
      const next = new Set(sel);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  readonly isAllMultipleSelected = computed(() => {
    const rows = this.newMultipleRows();
    return rows.length > 0 && this.selectedMultipleRows().size === rows.length;
  });

  readonly isSomeMultipleSelected = computed(() =>
    this.selectedMultipleRows().size > 0 && !this.isAllMultipleSelected()
  );

  toggleAllMultipleRows(): void {
    const rows = this.newMultipleRows();
    if (this.isAllMultipleSelected()) {
      this.selectedMultipleRows.set(new Set());
    } else {
      this.selectedMultipleRows.set(new Set(rows.map((_, i) => i)));
    }
  }

  // --- Pagination for new multiple DART table ---

  readonly multiTotalPages = computed(() =>
    Math.max(1, Math.ceil(this.newMultipleRows().length / this.multiPageSize()))
  );

  readonly multiPageNumbers = computed(() =>
    Array.from({ length: this.multiTotalPages() }, (_, i) => i + 1)
  );

  readonly pagedMultipleRows = computed(() => {
    const page = this.multiPage();
    const size = this.multiPageSize();
    return this.newMultipleRows()
      .map((row, i) => ({ row, globalIndex: i }))
      .slice((page - 1) * size, page * size);
  });

  goToMultiPage(page: number): void {
    const total = this.multiTotalPages();
    if (page < 1 || page > total) return;
    this.multiPage.set(page);
  }

  readonly multiPageRangeEnd = computed(() =>
    Math.min(this.multiPage() * this.multiPageSize(), this.newMultipleRows().length)
  );

  readonly multiPageRangeStart = computed(() =>
    (this.multiPage() - 1) * this.multiPageSize() + 1
  );



  private fetchAndAddRow(isInitial = false): void {
    const existingNumbers = this.newMultipleRows()
      .map(row => row.dartNo)
      .filter(no => no && no !== '—');


    this.multiDartService.getEquipmentRows({
      selections: [],
      existing_numbers: existingNumbers,
      blank: 1
    }, isInitial).subscribe({
      next: (res) => {
        let newRowsData = Array.isArray(res) ? res : (res.rows || res.data || [res]);
        if (!Array.isArray(newRowsData)) newRowsData = [newRowsData];


        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newRows = newRowsData.map((data: any) => ({
          ...this.blankMultipleRow(),
          ...data,
          dartNo: data.dartNo || data.dart_no || data.number || data.dart || '—'
        }));

        if (isInitial) {
          this.newMultipleRows.set(newRows);
        } else {
          this.newMultipleRows.update(rows => [...rows, ...newRows]);
        }

        const newTotal = Math.max(1, Math.ceil((this.newMultipleRows().length) / this.multiPageSize()));
        this.multiPage.set(newTotal);
      },
      error: (err) => {
        this.notification.error('Failed to add row from server');
        console.error(err);
        const fallback = [this.blankMultipleRow()];
        if (isInitial) {
          this.newMultipleRows.set(fallback);
        } else {
          this.newMultipleRows.update(rows => [...rows, ...fallback]);
        }
        const newTotal = Math.max(1, Math.ceil((this.newMultipleRows().length) / this.multiPageSize()));
        this.multiPage.set(newTotal);
      }
    });
  }

  openNewMultiple(): void {
    this.newMultipleRows.set([]);
    this.selectedMultipleRows.set(new Set());
    this.multiPage.set(1);
    this.view = 'newMultiple';
    this.fetchAndAddRow(true);
  }

  addMultipleRow(): void {
    this.fetchAndAddRow(false);
  }

  removeMultipleRow(index: number): void {
    this.newMultipleRows.update(rows => rows.filter((_, i) => i !== index));
    this.selectedMultipleRows.update(sel => {
      const next = new Set<number>();
      sel.forEach(i => { if (i < index) next.add(i); else if (i > index) next.add(i - 1); });
      return next;
    });
    // Clamp current page if it now exceeds total
    const newTotal = Math.max(1, Math.ceil(this.newMultipleRows().length / this.multiPageSize()));
    if (this.multiPage() > newTotal) this.multiPage.set(newTotal);
  }

  // --- Save Row Modal ("Raise this DART?") -----------------------------------------
  readonly saveRowModalOpen = signal(false);
  readonly saveRowModalIndex = signal<number>(-1);
  readonly saveRowMaintenancePeriod = signal('');
  readonly saveRowOccasion = signal('');

  readonly maintenancePeriodOptions = [
    'Refit 2025-26', 'Annual Docking 2025', 'Self-Maintenance Q3 2026', 'Intermediate Docking 2026',
  ];
  readonly dartOccasionOptions = [
    'First Occurrence', 'Recurrent', 'Post-Maintenance', 'Warranty Period',
  ];

  readonly saveRowEquipmentName = computed(() => {
    const idx = this.saveRowModalIndex();
    if (idx < 0) return '';
    return this.newMultipleRows()[idx]?.equipmentName ?? '';
  });

  openSaveRowModal(index: number): void {
    let rowsToCheck: ReturnType<typeof this.newMultipleRows> = [];
    let rowIndices: number[] = [];

    if (index >= 0) {
      rowsToCheck = [this.newMultipleRows()[index]];
      rowIndices = [index];
    } else {
      if (this.selectedMultipleRows().size === 0) {
        this.notification.warning('Please select at least one row to save.');
        return;
      }
      rowIndices = Array.from(this.selectedMultipleRows());
      rowsToCheck = rowIndices.map(i => this.newMultipleRows()[i]);
    }

    for (let i = 0; i < rowsToCheck.length; i++) {
      const row = rowsToCheck[i];
      const sNo = row.sNo || (rowIndices[i] + 1);

      if (!row.equipmentName || row.equipmentName === '—' ||
        !row.eqptNomenclature || row.eqptNomenclature === '—') {
        this.notification.warning(`Row ${sNo}: Pick Equipment Name and Nomenclature before saving.`);
        return;
      }
      if (this.isInvalidOption(row.equipmentName, this.multiEquipmentOptionsFull)) {
        this.notification.warning(`Row ${sNo}: Resolve invalid Equipment Name selection before saving.`);
        return;
      }
      if (this.isInvalidOption(row.eqptNomenclature, row.nomenclatureOptions || this.multiNomenclatureOptionsFull)) {
        this.notification.warning(`Row ${sNo}: Resolve invalid Eqpt Nomenclature selection before saving.`);
        return;
      }
      if (!row.defectDate || row.defectDate === '—' ||
        !row.symptoms || row.symptoms === '—' ||
        !row.severity || row.severity === '—') {
        this.notification.warning(`Row ${sNo}: Fill all required fields (Date, Symptoms, Severity) before saving.`);
        return;
      }
    }

    this.saveRowModalIndex.set(index);
    this.saveRowMaintenancePeriod.set('');
    this.saveRowOccasion.set('');
    this.saveRowModalOpen.set(true);
  }

  closeSaveRowModal(): void {
    this.saveRowModalOpen.set(false);
  }

  confirmSaveRowWithData(eventData: Record<string, unknown>): void {
    const maintenance = eventData['dartForMaintenance'] as string;
    const occasion = eventData['dartOccasion'] as string;

    if (!maintenance || !occasion) {
      this.notification.warning('Please fill all required fields.');
      return;
    }

    this.saveRowMaintenancePeriod.set(maintenance);
    this.saveRowOccasion.set(occasion);

    const idx = this.saveRowModalIndex();

    // Determine which rows to save
    let rowsToSave: ReturnType<typeof this.newMultipleRows> = [];
    let originalIndices: number[] = [];

    if (idx >= 0) {
      rowsToSave = [this.newMultipleRows()[idx]];
      originalIndices = [idx];
    } else {
      const selected = Array.from(this.selectedMultipleRows()).sort((a, b) => a - b);
      rowsToSave = selected.map(i => this.newMultipleRows()[i]);
      originalIndices = selected;
    }

    if (!rowsToSave.length) {
      this.saveRowModalOpen.set(false);
      return;
    }

    const payloadRows = rowsToSave.map((row, i) => {
      const equipId = this.multiEquipmentOptionsFull.find(e => e.label === row.equipmentName)?.id || '';
      const nomOptions = row.nomenclatureOptions || this.multiNomenclatureOptionsFull;
      const nomId = nomOptions.find(e => e.label === row.eqptNomenclature)?.id || '';
      const symptomId = this.multiSymptomOptionsFull.find(e => e.label === row.symptoms)?.id || '';
      const severityId = this.multiSeverityOptionsFull.find(e => e.label === row.severity)?.id || '';
      const assistanceId = this.multiReqAssistanceOptionsFull.find(e => e.label === row.reqAssistance)?.id || '';
      const remarkId = this.multiSsRemarksOptionsFull.find(e => e.label === row.ssRemarks)?.id || '';

      return {
        rid: `r${i}`,
        s_no: i + 1,
        dart_number: row.dartNo && row.dartNo !== '—' ? row.dartNo : `D-E-${50000 + originalIndices[i]}`,
        equipment_code: equipId,
        nomenclature_id: nomId,
        nomenclature: row.eqptNomenclature,
        sub_department: row.subDept,
        defect_date: row.defectDate,
        scheduled_date: row.scheduledDate,
        symptom_id: symptomId,
        severity_id: severityId,
        assistance_id: assistanceId,
        component: row.defectiveComponent,
        description: row.defectDescription,
        remark_id: remarkId,
        spares_required: row.sparesRequest,
        spares: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          obs: (row.selectedSpares || []).map((s: any) => ({
            pattern: s.patternNo || 'None',
            description: s.itemDesc || s.item_desc || '',
            qty: s.qtyRequired || 1,
            inventory_type: s.inventoryType || s.sourceTab || 'OBS'
          })),
          ilms: [],
          pil: []
        },
        saved_number: null,
        checked: true,
        errors: {}
      };
    });

    const payload = {
      maintenance_period: this.saveRowMaintenancePeriod(),
      dart_occasion: this.saveRowOccasion(),
      ops_period_id: null,
      refit_id: null,
      draft_id: null,
      rows: payloadRows
    };

    // Make the API call
    this.multiDartService.saveRows(payload)
      .subscribe({
        next: () => {
          if (idx >= 0) {
            this.notification.success(`DART raised successfully for ${rowsToSave[0].equipmentName || 'row'}`);
            this.newMultipleRows.update(rows => {
              const updated = [...rows];
              updated[idx] = { ...updated[idx], status: 'RAISED' };
              return updated;
            });
          } else {
            this.notification.success(`${rowsToSave.length} DART${rowsToSave.length > 1 ? 's' : ''} raised successfully`);
            this.newMultipleRows.update(rows => {
              const updated = [...rows];
              originalIndices.forEach(i => {
                updated[i] = { ...updated[i], status: 'RAISED' };
              });
              return updated;
            });
            this.selectedMultipleRows.set(new Set());
          }
          this.saveRowModalOpen.set(false);
        },
        error: (err) => {
          console.error('Save row error:', err);
          this.notification.error('Failed to raise DART(s)');
          this.saveRowModalOpen.set(false);
        }
      });
  }

  updateMultipleRow(index: number, field: string, value: string): void {
    this.newMultipleRows.update(rows => {
      return rows.map((row, i) => {
        if (i === index) {
          return { ...row, [field]: value };
        }
        return row;
      });
    });

    if (field === 'equipmentName') {
      const eqp = this.multiEquipmentOptionsFull.find(e => e.label === value);
      const code = eqp?.id;
      if (code) {
        this.multiDartService.getEquipmentObjects(code).subscribe({
          next: (res) => {
            const equipments = res?.['ship_equipments'];
            if (Array.isArray(equipments)) {
              const options = (equipments as { id: string | number; nomenclature: string }[]).map(item => ({
                id: item.id,
                label: item.nomenclature
              }));
              this.newMultipleRows.update(rows =>
                rows.map((row, i) => {
                  if (i === index) {
                    return { ...row, eqptNomenclature: '', nomenclatureOptions: options };
                  }
                  return row;
                })
              );
            }
          },
          error: (err) => console.error('Error fetching nomenclature for row', err)
        });
      } else {
        this.newMultipleRows.update(rows =>
          rows.map((row, i) => {
            if (i === index) {
              return { ...row, eqptNomenclature: '', nomenclatureOptions: undefined };
            }
            return row;
          })
        );
      }
    }

    if (field === 'eqptNomenclature') {
      const row = this.newMultipleRows()[index];
      const nomOptions = row.nomenclatureOptions || this.multiNomenclatureOptionsFull;
      const nom = nomOptions.find(e => String(e.label) === String(value));
      const code = nom?.id;
      if (code) {
        this.multiDartService.get_nomenclature_details(code).subscribe({
          next: (res) => {
            const data = res?.data || res;
            this.newMultipleRows.update(rows =>
              rows.map((r, i) => {
                if (i === index) {
                  return {
                    ...r,
                    subDept: data.sub_department || data.subDept || r.subDept,
                    ...data
                  };
                }
                return r;
              })
            );
          },
          error: (err) => console.error('Error fetching nomenclature details', err)
        });
      }
    }
  }

  linkSpares(index: number): void {
    this.activeSpareRowIndex.set(index);
    this.showSpareModal.set(true);
  }

  closeSpareModal(): void {
    this.showSpareModal.set(false);
    this.activeSpareRowIndex.set(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSparesSelected(spares: any[]): void {
    const index = this.activeSpareRowIndex();
    if (index !== null) {
      this.newMultipleRows.update(rows => {
        return rows.map((row, i) => {
          if (i === index) {
            return { ...row, selectedSpares: spares };
          }
          return row;
        });
      });
    }
    this.closeSpareModal();
  }

  readonly multiDraftColumnDefs: ColDef[] = [
    { headerName: "Draft Name", field: "draftName", flex: 2, minWidth: 180 },
    { headerName: "Rows", field: "rows", flex: 0.6, minWidth: 80 },
    { headerName: "Created By", field: "createdBy", flex: 1, minWidth: 130 },
    { headerName: "Last Updated By", field: "lastUpdatedBy", flex: 1, minWidth: 150 },
    { headerName: "Last Updated", field: "lastUpdated", flex: 1, minWidth: 140 },
    {
      headerName: "Status",
      field: "status",
      flex: 0.8,
      minWidth: 110,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: { toneMap: { Draft: "warning", Submitted: "success" } },
    },
    {
      headerName: "Action",
      field: "__actions",
      flex: 0.6,
      minWidth: 90,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (row: OpmMultipleDraftRow) => [
          {
            icon: "edit",
            label: "Open draft",
            color: "#7fb3e0",
            action: () => {

              this.multiDartService.draftOpen(row.id).subscribe({
                next: (res) => {
                  if (res.success === false) {
                    this.notification.error(res.error || 'Failed to open draft');
                    return;
                  }

                  let newRowsData = [];
                  if (Array.isArray(res)) {
                    newRowsData = res;
                  } else if (res.draft?.payload) {
                    let payload = res.draft.payload;
                    if (typeof payload === 'string') {
                      try { payload = JSON.parse(payload); } catch { /* ignore error */ }
                    }
                    if (payload?.rows) newRowsData = payload.rows;
                  } else {
                    newRowsData = res.rows || res.data || [];
                  }

                  if (!Array.isArray(newRowsData)) newRowsData = [newRowsData];

                  /* eslint-disable sonarjs/no-nested-functions */

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const newRows = newRowsData.map((d: any) => {
                    const eq = this.multiEquipmentOptionsFull.find(e => String(e.id) === String(d.equipment_code));
                    const eqName = eq ? eq.label : String(d.equipment_name ?? d.equipmentName ?? d.equipment_code ?? '');

                    const nom = this.multiNomenclatureOptionsFull.find(e => String(e.id) === String(d.nomenclature_id));
                    const nomName = nom ? nom.label : String(d.nomenclature ?? d.eqptNomenclature ?? '');

                    const sym = this.multiSymptomOptionsFull.find(e => String(e.id) === String(d.symptom_id));
                    const symName = sym ? sym.label : String(d.symptom_id ?? d.symptoms ?? '');

                    const sev = this.multiSeverityOptionsFull.find(e => String(e.id) === String(d.severity_id));
                    const sevName = sev ? sev.label : String(d.severity_id ?? d.severity ?? '');

                    const ast = this.multiReqAssistanceOptionsFull.find(e => String(e.id) === String(d.assistance_id));
                    const astName = ast ? ast.label : String(d.assistance_id ?? d.reqAssistance ?? '');

                    const rem = this.multiSsRemarksOptionsFull.find(e => String(e.id) === String(d.remark_id));
                    const remName = rem ? rem.label : String(d.remark_id ?? d.ssRemarks ?? '');

                    return {
                      ...this.blankMultipleRow(),
                      dartNo: String(d.dart_number ?? d.dartNo ?? d.dart_no ?? '—'),
                      sNo: String(d.s_no ?? d.sNo ?? ''),
                      equipmentName: eqName,
                      eqptNomenclature: nomName,
                      subDept: String(d.sub_department ?? d.subDept ?? ''),
                      defectDate: String(d.defect_date ?? d.defectDate ?? ''),
                      scheduledDate: String(d.scheduled_date ?? d.scheduledDate ?? ''),
                      symptoms: symName,
                      severity: sevName,
                      reqAssistance: astName,
                      defectiveComponent: String(d.component ?? d.defectiveComponent ?? ''),
                      defectDescription: String(d.description ?? d.defectDescription ?? ''),
                      ssRemarks: remName,
                      sparesRequest: String(d.spares_required ?? d.sparesRequest ?? ''),
                    };
                  });
                  /* eslint-enable sonarjs/no-nested-functions */

                  // Restore checked state for rows
                  const selectedIndices = new Set<number>();

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  newRowsData.forEach((d: any, i: number) => {
                    if (d.checked === true || d.checked === 'true') {
                      selectedIndices.add(i);
                    }
                  });
                  this.selectedMultipleRows.set(selectedIndices);

                  this.newMultipleRows.set(newRows);
                  this.multiPage.set(1);
                  this.view = 'newMultiple';
                },
                error: (err) => {
                  console.error("Failed to open draft:", err);
                  this.notification.error('API Error: ' + (err.message || 'Failed to open draft'));
                }
              });
            },
          },
          {
            icon: "delete",
            label: "Delete",
            color: "#dc2626",
            action: () => {
              if (confirm("Are you sure you want to delete this draft?")) {
                this.multiDartService.draftDelete(row.id).subscribe({
                  next: () => {
                    this.multiDraftRows = this.multiDraftRows.filter(r => r.id !== row.id);
                    // Create a new array reference to trigger Angular change detection if necessary
                    this.multiDraftRows = [...this.multiDraftRows];
                    this.cdr.markForCheck();
                    this.notification.success("Draft removed");
                  },
                  error: (err) => {
                    console.error("Failed to delete draft:", err);
                    this.notification.error("Failed to delete draft");
                  }
                });
              }
            },
          }
        ],
      },
    },
  ];

  readonly newMultipleColumnDefs: ColDef[] = [
    { headerName: 'DART No', field: 'dartNo', flex: 1.2, minWidth: 140, editable: false },
    { headerName: 'S No', field: 'sNo', flex: 0.6, minWidth: 70, editable: true },
    { headerName: 'Equipment Name', field: 'equipmentName', flex: 1.4, minWidth: 160, editable: true },
    { headerName: 'Eqpt Nomenclature', field: 'eqptNomenclature', flex: 1.3, minWidth: 155, editable: true },
    { headerName: 'Sub-Department', field: 'subDept', flex: 1.1, minWidth: 140, editable: true },
    { headerName: 'Defect Date', field: 'defectDate', flex: 1, minWidth: 120, editable: true },
    { headerName: 'Scheduled Date', field: 'scheduledDate', flex: 1, minWidth: 135, editable: true },
    { headerName: 'Symptoms', field: 'symptoms', flex: 1.2, minWidth: 130, editable: true },
    { headerName: 'Severity', field: 'severity', flex: 0.9, minWidth: 110, editable: true },
    { headerName: 'Required Assistance', field: 'reqAssistance', flex: 1.2, minWidth: 155, editable: true },
    { headerName: 'Defective Component', field: 'defectiveComponent', flex: 1.2, minWidth: 155, editable: true },
    { headerName: 'Defect Description', field: 'defectDescription', flex: 1.5, minWidth: 170, editable: true },
    { headerName: 'SS Remarks', field: 'ssRemarks', flex: 1.2, minWidth: 130, editable: true },
    { headerName: 'Spares Request', field: 'sparesRequest', flex: 1, minWidth: 130, editable: true },
    {
      headerName: 'Action',
      field: '__actions',
      flex: 0.6,
      minWidth: 90,
      sortable: false,
      cellRenderer: ActionRendererComponent,
      cellRendererParams: {
        actions: (params: { node: { rowIndex: number } }) => [{
          icon: 'trash-2',
          label: 'Delete row',
          color: '#f82c36',
          action: () => this.removeMultipleRow(params.node.rowIndex),
        }],
      },
    },
  ];
}
