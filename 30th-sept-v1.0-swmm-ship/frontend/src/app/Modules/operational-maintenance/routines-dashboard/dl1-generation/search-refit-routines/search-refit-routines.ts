import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ColDef, RowData } from 'ag-grid-community';
import { debounceTime, distinctUntilChanged, firstValueFrom } from 'rxjs';

import { MasterCard } from '../../../../refit-maintenance/master-card/master-card';
import { SelectInput } from '../../../../../shared/components/select-input/select-input';
import { DataGrid } from '../../../../../shared/components/data-grid/data-grid';
import { OperationalMaintenanceApi } from '../../../services/operational-maintenance-api';
import { RefitRoutineListItem, SelectOption } from '../refit-routines.model';
import { HelpGuidance } from '../../../../../shared/components/help-guidance/help-guidance';

const CONVERTED_OPTIONS: SelectOption[] = [
  { label: 'All', value: '' },
  { label: 'Converted', value: 'true' },
  { label: 'Not Converted', value: 'false' },
];

const HELP_HTML = `
  <p class="mb-0">Search for routines due for the refit Defect List — filter by section, equipment, and routine category (Running Hour or Calendar based), then use the results to generate a DL.</p>
`;

@Component({
  selector: 'app-search-refit-routines',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MasterCard,
    SelectInput,
    DataGrid,
    HelpGuidance, ButtonComponent],
  templateUrl: './search-refit-routines.html',
})
export class SearchRefitRoutines implements OnInit {
  readonly helpHtml = HELP_HTML;

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(OperationalMaintenanceApi);
  private readonly router = inject(Router);
  readonly convertedOptions = CONVERTED_OPTIONS;
  readonly sectionOptions = signal<SelectOption[]>([]);
  readonly rows = signal<RefitRoutineListItem[]>([]);
  readonly totalCount = signal(0);
  readonly isLoading = signal(false);

  searchForm: FormGroup = this.fb.group({
    section: [''],
    equipment: [''],
    routineName: [''],
    converted: [''],
  });

  columnDefs: ColDef[] = [
    { headerName: 'Sub-Dept', field: 'section', flex: 1 },
    {
      headerName: 'Equipment Nomenclature',
      field: 'equipment_name',
      flex: 2,
    },
    {
      headerName: 'Routine Name',
      field: 'routine_name',
      flex: 2,
    },
    {
      headerName: 'MAINTOP No',
      field: 'maintop_no',
      flex: 1,
    },
    {
      headerName: 'SS Routines',
      field: 'ss_routines',
      flex: 1,
    },
    {
      headerName: 'DYD Routines',
      field: 'dyd_routines',
      flex: 1,
    },
    {
      headerName: 'Total Routine Qty',
      field: 'total_routines',
      flex: 1,
    },
    {
      headerName: 'Converted',
      field: 'converted',
      flex: 1,
      valueGetter: (params) =>
        (params.data as RefitRoutineListItem)?.converted ? 'Yes' : 'No',
    },
  ];

  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadSectionOptions();
    await this.search();

    this.searchForm.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(
          (a, b) => JSON.stringify(a) === JSON.stringify(b),
        ),
      )
      .subscribe(() => {
        void this.search();
      });
  }

  private async loadSectionOptions(): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.getEmsSections());

      this.sectionOptions.set([
        { label: 'All', value: '' },
        ...Object.entries(response.section_name ?? {})
          .filter(([label]) => label !== '')
          .map(
            ([label, value]) => ({
              label,
              value,
            }),
          ),
      ]);
    } catch (error: unknown) {
      console.error('EMS Sections API Error:', error);

      this.sectionOptions.set([{ label: 'All', value: '' }]);
    }
  }

  async search(): Promise<void> {
    const {
      section,
      equipment,
      routineName,
      converted,
    } = this.searchForm.getRawValue();

    this.isLoading.set(true);
    try {
      const response = await firstValueFrom(
        this.api.searchRefitRoutines({
          section: section || undefined,
          equipment: equipment || undefined,
          routineName: routineName || undefined,
          converted:
            converted === ''
              ? undefined
              : converted === 'true',
        }),
      );
      this.rows.set(response?.results ?? []);
      this.totalCount.set(response?.count ?? 0);
    } catch (error: unknown) {
      console.error('Refit Search API Error:', error);

      this.rows.set([]);
      this.totalCount.set(0);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearFilters(): void {
    this.searchForm.reset({
      section: '',
      equipment: '',
      routineName: '',
      converted: '',
    });
  }

  onRowClicked(row: RowData): void {
    const pk = (row as unknown as RefitRoutineListItem)?.pk;

    if (!pk) {
      return;
    }

    void this.router.navigate(
      [
        '/afterAuth/op-maintenance/routine/dl1-generation/refit-routine-detail',
      ],
      {
        state: {
          refitRoutineId: pk,
        },
      },
    );
  }
}
