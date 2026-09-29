import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ColDef } from 'ag-grid-community';
// Old import:
// import { PaginateTableComponent } from '../../../../../Components/paginate-table/paginate-table.component';
import { PaginateTableComponent } from '../../../ui/paginate-table/paginate-table.component';
import { AgActionCellComponent } from '../../../ui/master-compat';
import {
  resolveTrialSubSubSystemName,
  resolveTrialSubsystemName,
  resolveTrialSystemName,
} from '../seg-trial-prefill.shared';
import {
  resolveCatalogueQuantityUnique,
  SEG_CATALOGUE_LIST_API,
} from './seg-catalogue-form.shared';

@Component({
  selector: 'app-seg-create-catalogue',
  standalone: true,
  imports: [CommonModule, PaginateTableComponent],
  templateUrl: './create-catalogue.html',
})
export class SegCreateCatalogueComponent {
  tableUrl = SEG_CATALOGUE_LIST_API;
  rowData: Record<string, unknown>[] = [];

  addButtons = [
    { label: 'Create catalogue', key: 'add', show: true, cls: 'bg-blue-900 text-white' },
  ];

  columnDefs: ColDef[] = [
    {
      headerName: 'System',
      field: 'system_details',
      flex: 1,
      minWidth: 120,
      valueGetter: (params) =>
        resolveTrialSystemName(params.data as Record<string, unknown>),
      cellRenderer: (params: { data?: Record<string, unknown> }) => {
        const details =
          params.data?.['system_subsystem_details'] ||
          params.data?.['system_details'] ||
          [];
        if (Array.isArray(details) && details.length > 0) {
          const names = [
            ...new Set(
              details
                .map((item) => (item as { system_name?: string }).system_name)
                .filter((name): name is string => Boolean(name)),
            ),
          ];
          return names.join('<br/>');
        }
        return resolveTrialSystemName(params.data) || '';
      },
    },
    {
      headerName: 'Sub System',
      field: 'subsystem_details',
      flex: 1,
      minWidth: 120,
      valueGetter: (params) =>
        resolveTrialSubsystemName(params.data as Record<string, unknown>),
      cellRenderer: (params: { data?: Record<string, unknown> }) => {
        const details =
          params.data?.['system_subsystem_details'] ||
          params.data?.['subsystem_details'] ||
          [];
        if (Array.isArray(details) && details.length > 0) {
          return details
            .map((item) => {
              const row = item as {
                subsystem_name?: string;
                system_name?: string;
              };
              const name = row.subsystem_name || '';
              const system = row.system_name ? ` (${row.system_name})` : '';
              return `${name}${system}`;
            })
            .join('<br/>');
        }
        return resolveTrialSubsystemName(params.data) || '';
      },
    },
    {
      headerName: 'Sub Sub System',
      field: 'sub_subsystem_details',
      flex: 1,
      minWidth: 130,
      valueGetter: (params) =>
        resolveTrialSubSubSystemName(params.data as Record<string, unknown>),
    },
    {
      headerName: 'Quantity(Unique)',
      field: 'quantity_unique',
      minWidth: 140,
      valueGetter: (params) =>
        resolveCatalogueQuantityUnique(params.data as Record<string, unknown>),
    },
    this.buildViewColumn('View MMDS', 'view_mmds', 'mmds'),
    this.buildViewColumn('View files', 'view_files', 'files'),
    this.buildViewColumn('View Images', 'view_images', 'images'),
    this.buildViewColumn('View Catlaogue', 'view_catalogue', 'catalogue'),
  ];

  constructor(private readonly router: Router) {}

  handleAddButtonClick(event: { key: string }): void {
    if (event.key === 'add') {
      this.router.navigate(['/transactions/seg-catalogue/create']);
    }
  }

  private onViewAction(
    action: string,
    row: Record<string, unknown>,
  ): void {
    console.log('SEG catalogue view action:', action, row);
  }

  private buildViewColumn(
    headerName: string,
    field: string,
    actionKey: string,
  ): ColDef {
    return {
      headerName,
      field,
      minWidth: 120,
      maxWidth: 150,
      sortable: false,
      filter: false,
      cellRenderer: AgActionCellComponent,
      cellRendererParams: {
        actionDisplayMode: 'float',
        onAction: (_key: string, row: Record<string, unknown>) =>
          this.onViewAction(actionKey, row),
        actions: [
          {
            key: 'view',
            label: headerName,
            iconClass: 'fa fa-eye',
            btnClass: 'bg-green-100 text-green-600 hover:bg-green-200',
          },
        ],
      },
    };
  }
}
