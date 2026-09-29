import {
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputComponent } from '../input.component';
import { TextareaComponent } from '../textarea';

@Component({
  selector: 'app-nested-dynmic-table',
  standalone: true,
  imports: [CommonModule, FormsModule, InputComponent, TextareaComponent],
  templateUrl: './nested-dynmic-table.html',
})
export class NestedDynmicTable implements OnInit, OnChanges {
  @Input() table: any;
  /** When true, copy/remove table actions update the local tables list. */
  @Input() selfManaged = false;
  @Input() readonly = false;
  @Input() showControls = true;

  @Output() tableChange = new EventEmitter<any>();
  @Output() tableCopy = new EventEmitter<any>();
  @Output() tableRemove = new EventEmitter<any>();

  tables: any[] = [];
  private readonly cdr = inject(ChangeDetectorRef);

  ngOnInit(): void {
    this.syncTables();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['table']) {
      this.syncTables();
    }
  }

  private syncTables(): void {
    if (Array.isArray(this.table)) {
      this.tables = this.table;
    } else if (this.table) {
      this.tables = [this.table];
    } else if (!this.tables.length) {
      this.selfManaged = true;
      this.tables = this.createDemoTables();
    }

    this.tables.forEach((t) => this.prepareTable(t));
    this.cdr.markForCheck();
  }

  private createDemoTables(): any[] {
    return JSON.parse(JSON.stringify(this.table));
  }

  prepareTable(table: any): void {
    if (!table) return;

    if (table.type === 'checklist' && (!table.rows || table.rows.length === 0)) {
      table.rows = [{ description: '', value: '' }];
    }

    if (table.type === 'equipment') {
      this.prepareEquipmentGroups(table, table);

      if (this.hasEquipmentRowActions(table)) {
        this.prepareEquipmentRows(table);
      }
    }

    if (table.type === 'nested' && (!table.groups || table.groups.length === 0)) {
      table.groups = [];

      for (let i = 1; i <= (table.defaultCount || 1); i++) {
        table.groups.push(this.createNestedGroup(table, i));
      }
    }

    this.bumpRenderKey(table);
  }

  private bumpRenderKey(table: any): void {
    table._renderKey = (table._renderKey || 0) + 1;
  }

  trackByTableId(index: number, table: any): string {
    return `${table?.id ?? 'table'}_${table?._renderKey ?? 0}_${index}`;
  }

  addRow(index: number, table: any): void {
    if (this.readonly) return;

    if (!table?.rows?.length) {
      table.rows = [{ description: '', value: '' }];
    }

    const newRow = JSON.parse(JSON.stringify(table.rows[index]));

    Object.keys(newRow).forEach((key) => {
      if (key !== 'description') {
        newRow[key] = '';
      }
    });

    table.rows.splice(index + 1, 0, newRow);
    this.refresh(table);
  }

  removeRow(index: number, table: any): void {
    if (this.readonly) return;

    if (!table.rows || table.rows.length <= 1) {
      alert('At least one row is required.');
      return;
    }

    table.rows.splice(index, 1);
    this.refresh(table);
  }

  addEquipment(table: any, groupIndex: number, equipmentRow?: any): void {
    if (this.readonly) return;

    const targetRow = equipmentRow ?? table;
    const group = targetRow.groups[groupIndex];
    const baseName = this.getEquipmentBaseName(table, group);
    const newGroup = {
      ...JSON.parse(JSON.stringify(group)),
      name: baseName,
      baseName,
      value: '',
    };

    targetRow.groups.splice(groupIndex + 1, 0, newGroup);
    this.renumberEquipment(table, baseName, targetRow);
    this.syncRootEquipmentRow(table);
    this.refresh(table);
  }

  removeEquipment(table: any, index?: number, equipmentRow?: any): void {
    if (this.readonly) return;

    const targetRow = equipmentRow ?? table;

    if (!targetRow.groups || targetRow.groups.length <= 1) {
      alert('At least one equipment is required.');
      return;
    }

    const removedBaseName = index !== undefined && index !== null
      ? this.getEquipmentBaseName(table, targetRow.groups[index])
      : this.getEquipmentBaseName(table, targetRow.groups[targetRow.groups.length - 1]);

    if (index !== undefined && index !== null) {
      targetRow.groups.splice(index, 1);
    } else {
      targetRow.groups.pop();
    }

    this.renumberEquipment(table, removedBaseName, targetRow);
    this.syncRootEquipmentRow(table);
    this.refresh(table);
  }

  renumberEquipment(table: any, baseName?: string, equipmentRow?: any): void {
    const targetBaseName = baseName ?? table.equipmentName;
    const groups = equipmentRow?.groups ?? table.groups ?? [];
    const matchingGroups = groups.filter(
      (group: any) => this.getEquipmentBaseName(table, group) === targetBaseName,
    );

    matchingGroups.forEach((group: any, index: number) => {
      group.name = matchingGroups.length > 1 ? `${targetBaseName} ${index + 1}` : targetBaseName;
    });
  }

  getEquipmentBaseName(table: any, group: any): string {
    return group?.baseName ?? table?.equipmentName ?? String(group?.name ?? '').replace(/\s+\d+$/, '');
  }

  getEquipmentAddLabel(table: any, group: any): string {
    return group?.addLabel ?? `Add another ${this.getEquipmentBaseName(table, group)} / remove`;
  }

  hasEquipmentRowActions(table: any): boolean {
    return !!table?.allowFullRowActions;
  }

  getEquipmentRows(table: any): any[] {
    return this.hasEquipmentRowActions(table) ? table.rows : [table];
  }

  getEquipmentRowAddLabel(table: any): string {
    return table?.rowAddLabel ?? 'Add full row / remove';
  }

  updateEquipmentRowDescription(table: any, equipmentRow: any, value: string): void {
    equipmentRow.description = value;
    this.syncRootEquipmentRow(table);
    this.emitTableChange(table);
  }

  addEquipmentRow(table: any, rowIndex: number): void {
    if (this.readonly) return;

    this.prepareEquipmentRows(table);

    const sourceRow = table.rows[rowIndex] ?? table.rows[table.rows.length - 1];
    const newRow = JSON.parse(JSON.stringify(sourceRow));

    for (const group of newRow.groups || []) {
      group.value = '';
    }

    table.rows.splice(rowIndex + 1, 0, newRow);
    this.syncRootEquipmentRow(table);
    this.refresh(table);
  }

  removeEquipmentRow(table: any, rowIndex: number): void {
    if (this.readonly) return;

    this.prepareEquipmentRows(table);

    if (!table.rows || table.rows.length <= 1) {
      alert('At least one row is required.');
      return;
    }

    table.rows.splice(rowIndex, 1);
    this.syncRootEquipmentRow(table);
    this.refresh(table);
  }

  private prepareEquipmentRows(table: any): void {
    if (!Array.isArray(table.rows) || table.rows.length === 0) {
      table.rows = [
        {
          description: table.description ?? '',
          groups: JSON.parse(JSON.stringify(table.groups || [])),
        },
      ];
    }

    table.rows.forEach((row: any) => {
      if (row.description === undefined) row.description = table.description ?? '';
      this.prepareEquipmentGroups(table, row);
    });

    this.syncRootEquipmentRow(table);
  }

  private prepareEquipmentGroups(table: any, target: any): void {
    if (target.groups && target.groups.length > 0) return;

    target.groups = [];

    for (let i = 1; i <= (table.defaultCount || 1); i++) {
      target.groups.push({
        name: `${table.equipmentName} ${i}`,
        baseName: table.equipmentName,
        value: '',
      });
    }
  }

  private syncRootEquipmentRow(table: any): void {
    if (!this.hasEquipmentRowActions(table) || !table.rows?.length) return;

    table.description = table.rows[0].description;
    table.groups = table.rows[0].groups;
  }

  createNestedGroup(table: any, index: number): any {
    return {
      name: `${table.groupName} ${index}`,
      rows: table.childRows.map((child: any) => ({
        label: child.label,
        displayLabel: `${table.groupName} ${index} ${child.label}`,
        value: '',
      })),
    };
  }

  addNestedGroup(table: any): void {
    if (this.readonly) return;

    const nextIndex = table.groups.length + 1;

    table.groups.push(this.createNestedGroup(table, nextIndex));

    this.renumberNestedGroups(table);
    this.refresh(table);
  }

  removeNestedGroup(table: any, groupIndex: number): void {
    if (this.readonly) return;

    if (!table.groups || table.groups.length <= 1) {
      alert('At least one group is required.');
      return;
    }

    table.groups.splice(groupIndex, 1);
    this.renumberNestedGroups(table);
    this.refresh(table);
  }

  renumberNestedGroups(table: any): void {
    table.groups.forEach((group: any, groupIndex: number) => {
      const currentNo = groupIndex + 1;

      group.name = `${table.groupName} ${currentNo}`;

      group.rows.forEach((row: any) => {
        row.displayLabel = `${table.groupName} ${currentNo} ${row.label}`;
      });
    });
  }

  getNestedRowSpan(table: any): number {
    if (!table.groups) return 1;

    let count = 0;

    table.groups.forEach((group: any) => {
      count += group.rows.length + (this.showControls ? 1 : 0);
    });

    return count;
  }

  getEquipmentRowSpan(table: any, equipmentRow?: any): number {
    return (equipmentRow?.groups?.length || table?.groups?.length || 1) * (this.showControls ? 2 : 1);
  }

  copyFullTable(table: any, tableIndex: number): void {
    if (this.readonly) return;

    const copiedTable = JSON.parse(JSON.stringify(table));
    copiedTable.id = `${copiedTable.id}_${Date.now()}`;

    this.tableCopy.emit({ table: copiedTable, insertIndex: tableIndex });

    if (this.selfManaged) {
      this.tables.splice(tableIndex + 1, 0, copiedTable);
      this.tables = [...this.tables];
      this.prepareTable(copiedTable);
      this.cdr.markForCheck();
    }
  }

  removeFullTable(table: any): void {
    if (this.readonly) return;

    this.tableRemove.emit(table);

    if (this.selfManaged) {
      if (this.tables.length <= 1) {
        alert('At least one table is required.');
        return;
      }

      this.tables = this.tables.filter((t) => t !== table);
      this.cdr.markForCheck();
    }
  }

  getSerial(table: any, index: number): string {
    const serialIndex = index + Math.max((table?.serialStart ?? 1) - 1, 0);

    if (table.serialType === 'alpha') {
      return `(${String.fromCharCode(97 + serialIndex)})`;
    }

    if (table.serialType === 'roman') {
      return `(${this.toRoman(serialIndex + 1).toLowerCase()})`;
    }

    return `${serialIndex + 1}`;
  }

  private refresh(table: any): void {
    this.bumpRenderKey(table);
    this.emitTableChange(table);
    this.cdr.markForCheck();
  }

  emitTableChange(table: any): void {
    this.tableChange.emit(table);
  }

  toRoman(num: number): string {
    const romanMap: any[] = [
      [1000, 'M'],
      [900, 'CM'],
      [500, 'D'],
      [400, 'CD'],
      [100, 'C'],
      [90, 'XC'],
      [50, 'L'],
      [40, 'XL'],
      [10, 'X'],
      [9, 'IX'],
      [5, 'V'],
      [4, 'IV'],
      [1, 'I'],
    ];

    let result = '';

    for (const [value, symbol] of romanMap) {
      while (num >= value) {
        result += symbol;
        num -= value;
      }
    }

    return result;
  }
}
