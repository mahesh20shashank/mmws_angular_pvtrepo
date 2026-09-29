import { Component } from '@angular/core';
import { AgActionCellComponent } from '../../ui/master-compat';
import { PaginateTableComponent } from '../../ui/paginate-table/paginate-table.component';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { AddFormComponent } from '../../ui/add-form/add-form.component';

@Component({
  selector: 'app-equipments',
  imports: [CommonModule, FormsModule, PaginateTableComponent,AddFormComponent],
  templateUrl: './equipments.html',
})
export class Equipments {

  title = 'Add Equipments';
  selectedShip = '';
  selectedSection = '';

shipList: { id: string; name: string }[] = [
  { id: '1', name: 'Ship A' },
  { id: '2', name: 'Ship B' },
  { id: '3', name: 'Ship C' },
];

sectionList: { id: string; name: string }[] = [
  { id: '1', name: 'Section A' },
  { id: '2', name: 'Section B' },
  { id: '3', name: 'Section C' },
];

onSearch(): void {
  if (!this.selectedShip || !this.selectedSection) {
    alert('Please select both Ship and Section');
    return;
  }
  console.log('Searching with:', this.selectedShip, this.selectedSection);
  // your API call here
}
    rowData: any[] = [];
    showCreateLayout = false;
     columnOilData = [
          // { headerName: 'Ser', valueGetter: (params: { data: { rowIndex: number; }; }) => params.data.rowIndex + 1, width: 80, minWidth: 70 },

          { field: 'ship_name', headerName: 'Ship', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'section_name', headerName: 'Section', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'name', headerName: 'Name', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'code', headerName: 'Equipment Code', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'serial_no', headerName: 'Serial Number', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'model', headerName: 'Model', filter: 'agTextColumnFilter', flex: 1, minWidth: 150 },
          { field: 'active', headerName: 'Status', filter: 'agTextColumnFilter',  minWidth: 150 },
          // { headerName: 'Action', field: 'actions', minWidth: 150, sortable: false, filter: false, cellRenderer: AgActionCellComponent, cellRendererParams: { actionDisplayMode: 'float', onMainAction: (row: any) => console.log('Main action', row), onAction: (k: string, r: any) => this.triggerOilModal(k, r, 'Oil Details'), actions: [ { key: 'edit', label: 'Edit', iconClass: 'fa fa-edit', btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200' }, { key: 'delete', label: 'Delete', iconClass: 'fa fa-trash', btnClass: 'bg-red-100 text-red-600 hover:bg-red-200' } ] } }
          {
          headerName: 'Action',
          field: 'actions',
          minWidth: 80,
          width: 80,
          maxWidth: 90,
          sortable: false,
          filter: false,
          pinned: 'right' as const,
          cellRenderer: AgActionCellComponent,
          cellRendererParams: {
            actionDisplayMode: 'float',
            onAction: (k: string, r: any) => this.onGridAction(k, r),
            actions: [
              {
                key: 'add',
                label: 'Add',
                iconClass: 'fa fa-plus',
                btnClass: 'bg-blue-100 text-blue-600 hover:bg-blue-200',
              },
              {
                key: 'delete',
                label: 'Delete',
                iconClass: 'fa fa-trash',
                btnClass: 'bg-red-100 text-red-600 hover:bg-red-200',
              },
            ],
          },
        },
        ];

          addButtons = [
        { label: 'Create', key: 'add', show: true, cls: 'bg-blue-900 text-white' },

      ];

    tabs = [
        { id: 'equipments', label: 'Equipments', icon: 'fa-solid fa-oil-can' , url: 'transaction/get-oil-data?searchInput=&page=1', columnDefs: this.columnOilData },
      ];
      activeTab = this.tabs[0];

   private onGridAction(key: string, _row: any): void {
        if (key === 'add') {
          // this.openAddPopup();
        }
      }

  formConfigForNewDetails: any[] = [
    {
      label: 'Select Ship',
      key: 'ship',
      type: 'select',
      required: true,
      options: [
          { label: 'Type A', value: 'A' },
          { label: 'Type B', value: 'B' },
        ],
      labelKey: 'label',
      valueKey: 'value',
      placeholder: 'Select Ship'
    },
    {
      label: 'Select Section',
      key: 'section',
      type: 'select',
      required: true,
      options: [
          { label: 'Type A', value: 'A' },
          { label: 'Type B', value: 'B' },
        ],
      labelKey: 'label',
      valueKey: 'value',
      placeholder: 'Select Section'
    },
    {
      label: 'Name',
      key: 'name',
      type: 'text',
      required: true,
      placeholder: 'Enter Trial Unit Name'
    },
    {
      label: 'Description',
      key: 'description',
      type: 'textarea', // better than text
      required: true,
      placeholder: 'Enter Description',
      rows: 2
    },
    {
      label: 'Code',
      key: 'code',
      type: 'text',
      required: true,
      placeholder: 'Enter Code'
    },
      {
      label: 'Serial Number',
      key: 'serialNumber',
      type: 'text',
      required: true,
      placeholder: 'Enter Serial Number'
    },
    {
      label: 'Model',
      key: 'model',
      type: 'text',
      required: true,
      placeholder: 'Enter Model'
    },
    {
      label: 'Sequence',
      key: 'sequence',
      type: 'number', // FIXED (not text)
      required: true,
      placeholder: 'Enter Sequence',
      min: 0
    },
    {
      label: 'Active',
      key: 'isActive',
      type: 'checkbox'
    }
  ];

  headerTitle = '';
    triggerOilModal(key: string, rowData?: any, headerTitle?: string): void {
      this.headerTitle = headerTitle || '';
      console.log(key, rowData, headerTitle);
      this.showCreateLayout = true;
      if(this.headerTitle === 'Oil Details') {
        if(key === 'edit') {

        }

      }
    }

    handleSubmit(event: any): void {
      console.log(event);
    }

}
