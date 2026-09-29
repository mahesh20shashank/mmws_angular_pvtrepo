import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';

import {
  DynamicFieldRendererComponent,
  DynamicFieldSchema,
} from './dynamic-field-renderer.component';
import { DynamicMatrixTableComponent } from './resuable-table-matrix';
import { NestedDynmicTable } from '../ui/nested-dynmic-table/nested-dynmic-table';

import { ReviewTableComponent } from '../ui/final-remark-observation/review-table.component';
import { FormApiService } from './form-api.service';

export interface ChartDatasetConfig {
  key: string;
  label: string;
  color?: string;
}

export interface MultipleGraphConfig {
  title: string;
  type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
  rowIndices: number[];
  labelKey?: string;
  description?: string;
  datasets?: ChartDatasetConfig[];
}
import {
  DynamicTableConfigService,
  DynamicVisibilityCondition,
} from './dynamic-table-config.service';

export interface DynamicTableSchema {
  id: string;
  sectionType: 'simpleTable' | 'matrixTable' | 'nestedDynamicTable';
  sectionGroup: any;
  title: string;
  topHeaders: any[][];
  columns: any[];
  rows: any[];
  showRowActions?: boolean;
  minRows?: number;
  multipleGraphs?: MultipleGraphConfig[];
  chart?: {
    enabled: boolean;
    type: 'bar' | 'line' | 'pie' | 'doughnut' | 'radar';
    title?: string;
    xAxisKey?: string;
    yAxisKey?: string;
    position?: 'top' | 'bottom';
    labelKey?: string;
    datasets?: ChartDatasetConfig[];
  };
  showIf?: DynamicVisibilityCondition | DynamicVisibilityCondition[];
}

export interface DynamicSectionSchema {
  sectionGroup?: any;
  id: string;
  title: string;
  sectionType: 'fields' | 'simpleTable' | 'matrixTable' | 'hybrid';
  fields: DynamicFieldSchema[];
  tables: DynamicTableSchema[];
}

@Component({
  selector: 'app-dynamic-section-renderer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    DynamicFieldRendererComponent,
    DynamicMatrixTableComponent,
    NestedDynmicTable,
    ReviewTableComponent,
  ],
  template: `
    <div class=" ">
       <h3 *ngIf="isHtml(section.title); else plainTitle" class="mb-3 head3" [innerHTML]="section.title"></h3>
      <ng-template #plainTitle>
         <h3  class="mb-3 head3">
          {{ section.title }}
        </h3>
      </ng-template>

      <ng-container *ngIf="hasSectionGroups; else fallbackSectionContent">
        <ng-container
          *ngFor="let block of orderedSectionBlocks; trackBy: trackByGroup"
        >
          <div
            *ngIf="block.kind === 'fields' && block.fields?.length"
             class="mt-3 grid grid-cols-1 gap-4 md:grid-cols-12"
          >
            <app-dynamic-field-renderer
              *ngFor="
                let field of block.fields;
                let i = index;
                trackBy: trackByField
              "
              [field]="field"
              [allFields]="block.fields || []"
              [formData]="formData"
              [isFromEdit]="isFormReadOnly"
              (fieldChange)="onGroupedFieldChange(block.key, i, $event)"
            ></app-dynamic-field-renderer>
          </div>

          <div
            *ngIf="block.kind === 'tables' && block.tables?.length"
             class="mt-3 space-y-4 rounded-lg border border-white/15 p-4"
          >
            <ng-container
              *ngFor="
                let table of block.tables;
                let tableIndex = index;
                trackBy: trackByTable
              "
            >
              <div *ngIf="isTableVisible(table)" class="mt-3 overflow-x-auto">
                <div
                  *ngIf="table.title"
                   class="mb-2 text-sm font-semibold text-white/70"
                >
                  <ng-container *ngIf="isHtml(table.title) && !isNestedDynamicTable(table); else plainTitle">
                    <span [innerHTML]="table.title"></span>
                  </ng-container>

                  <ng-template #plainTitle>
                    <span *ngIf="!isNestedDynamicTable(table)" >{{ table.title }}</span>
                  </ng-template>
                </div>

                <ng-container *ngIf="isNestedDynamicTable(table); else groupedMatrixTable">
                  <app-nested-dynmic-table
                    [table]="table"
                    [readonly]="isFormReadOnly"
                    [showControls]="!isFormReadOnly"
                    (tableChange)="onGroupedNestedTableChange(block.key, tableIndex, $event)"
                    (tableCopy)="onGroupedNestedTableCopy(block.key, tableIndex, $event)"
                    (tableRemove)="onGroupedNestedTableRemove(block.key, tableIndex)">
                  </app-nested-dynmic-table>
                </ng-container>

                <ng-template #groupedMatrixTable>
                  <app-dynamic-matrix-table
                    [tableId]="table.id"
                    [formData]="formData"
                    [topHeaders]="table.topHeaders || []"
                    [columns]="table.columns || []"
                    [rows]="table.rows || []"
                    [showRowActions]="!!table.showRowActions"
                    [minRows]="table.minRows ?? 1"
                    [disabled]="isFormReadOnly"
                    [chart]="table.chart"
                    [multipleGraphs]="table.multipleGraphs"
                    (rowsChange)="
                      onGroupedTableRowsChange(block.key, tableIndex, $event)
                    "
                    (dataChange)="onTableDataChange(table.id, $event)"
                  ></app-dynamic-matrix-table>
                </ng-template>
              </div>
            </ng-container>
          </div>
           <div *ngIf="block.kind === 'images' && block.images?.length" class="mt-3 space-y-4 rounded-lg border border-white/15 p-4">
            <ng-container
              *ngFor="
                let image of block.images;
                let imageIndex = index;
                trackBy: trackByField
              "
            >
              <div class="mb-4 flex flex-col items-center">
                 <div *ngIf="image.title" class="mb-2 text-sm font-semibold text-white/70">
                  <ng-container *ngIf="isHtml(image.title); else plainImageTitle">
                    <span [innerHTML]="image.title"></span>
                  </ng-container>
                  <ng-template #plainImageTitle>
                    <span>{{ image.title }}</span>
                  </ng-template>
                </div>
                <img
                  [src]="image.src"
                  [alt]="image.alt || image.title || ('Image ' + imageIndex + 1)"
                  class="max-w-full rounded shadow"
                  *ngIf="image.src"
                />
                <div *ngIf="image.caption" class="mt-1 text-xs text-white/60">
                  {{ image.caption }}
                </div>
              </div>
            </ng-container>
          </div>

        </ng-container>
      </ng-container>

      <ng-template #fallbackSectionContent>
        <div
          *ngIf="section.fields?.length"
           class="grid grid-cols-1 gap-4 md:grid-cols-12"
        >
          <app-dynamic-field-renderer
            *ngFor="
              let field of section.fields;
              let i = index;
              trackBy: trackByField
            "
            [field]="field"
            [allFields]="section.fields"
            [formData]="formData"
            [isFromEdit]="isFormReadOnly"
            (fieldChange)="onFieldChange(i, $event)"
          ></app-dynamic-field-renderer>
        </div>

        <div *ngIf="section.tables?.length" class="mt-3 space-y-4">
          <ng-container
            *ngFor="
              let table of section.tables;
              let tableIndex = index;
              trackBy: trackByTable
            "
          >
             <div *ngIf="isTableVisible(table)" class="mt-3 overflow-x-auto rounded-lg border border-white/15 p-4">
              <div
                *ngIf="table.title"
                 class="mb-2 text-sm font-semibold text-white/70"
              >
                <ng-container *ngIf="isHtml(table.title); else plainTitle">
                  <span [innerHTML]="table.title"></span>
                </ng-container>

                <ng-template #plainTitle>
                  <span  >{{ table.title }}</span>
                </ng-template>
              </div>

              <ng-container *ngIf="isNestedDynamicTable(table); else matrixTable">
                <app-nested-dynmic-table
                  [table]="table"
                  [readonly]="isFormReadOnly"
                  [showControls]="!isFormReadOnly"
                  (tableChange)="onNestedTableChange(tableIndex, $event)"
                  (tableCopy)="onNestedTableCopy(tableIndex, $event)"
                  (tableRemove)="onNestedTableRemove(tableIndex)">
                </app-nested-dynmic-table>
              </ng-container>

              <ng-template #matrixTable>
                <app-dynamic-matrix-table
                  [tableId]="table.id"
                  [formData]="formData"
                  [topHeaders]="table.topHeaders || []"
                  [columns]="table.columns || []"
                  [rows]="table.rows || []"
                  [showRowActions]="!!table.showRowActions"
                  [minRows]="table.minRows ?? 1"
                  [disabled]="isFormReadOnly"
                  [chart]="table.chart"
                  [multipleGraphs]="table.multipleGraphs"
                  (rowsChange)="onTableRowsChange(tableIndex, $event)"
                  (dataChange)="onTableDataChange(table.id, $event)"
                ></app-dynamic-matrix-table>
              </ng-template>
            </div>
          </ng-container>
        </div>
      </ng-template>

      <div *ngIf="isLastSection" class="mt-4 space-y-4">
         <div *ngIf="formApiService?.context?.trial_form_type !== 6" class="overflow-hidden rounded-lg border border-white/15 p-4">
          <div>
            <app-review-table *ngIf="formApiService?.context?.trial_form_type !== 6" [equipmentId]="activeEquipmentId" ></app-review-table>
          </div>
          <!-- <div>
            <app-editor [height]="250"></app-editor>
          </div> -->
        </div>

        <!-- </ng-container> -->
      </div>
    </div>
  `,
})
export class DynamicSectionRendererComponent implements OnChanges {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly visibilityService = inject(DynamicTableConfigService);
  public readonly formApiService = inject(FormApiService);
  @ViewChild(ReviewTableComponent) reviewTable!: ReviewTableComponent;
  @Input() section!: DynamicSectionSchema;
  @Input() isLastSection = false;
  @Input() sectionGroup?: any;
  @Input() formData: Record<string, any> = {};
  @Input() isFormReadOnly = false;
  @Input() equipmentId: string | number | null = null;
  @Output() sectionChange = new EventEmitter<DynamicSectionSchema>();
  @Output() tableDataChange = new EventEmitter<{
    tableId: string;
    data: any[];
  }>();
  orderedSectionBlocks: {
    key: string;
    kind: 'fields' | 'tables' | 'images';
    order: number;
    fields?: DynamicFieldSchema[];
    tables?: DynamicTableSchema[];
    images?: any[];
   }[] = [];
  orderedSectionGroups: {
    id: string;
    fields: DynamicFieldSchema[];
    tables: DynamicTableSchema[];
  }[] = [];
  hasSectionGroups = false;
  get activeEquipmentId(): number | null {
    return this.equipmentId ?? this.formApiService?.currentEquipmentNomenclature?.id ?? null;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['section'] || changes['sectionGroup'] || changes['formData']) {
      this.rebuildSectionGroups();
      this.cdr.markForCheck();
    }
  }

  trackByField(index: number, item: any) {
    return item.name || index;
  }

  trackByTable(index: number, item: any) {
    return item.id || index;
  }

  trackByGroup(index: number, item: any) {
    return item.key || item.id || index;
  }

  rebuildSectionGroups(): void {
    const sectionGroup = this.section?.sectionGroup ?? this.sectionGroup;
    const groupMap = new Map<
      string,
      {
        id: string;
        fields: DynamicFieldSchema[];
        tables: DynamicTableSchema[];
        order: number;
      }
    >();

    if (!sectionGroup || typeof sectionGroup !== 'object') {
      this.orderedSectionBlocks = [];
      this.orderedSectionGroups = [];
      this.hasSectionGroups = false;
      return;
    }

    this.orderedSectionBlocks = [];
    Object.keys(sectionGroup).forEach((key, index) => {
      const match = key.match(/^(fields|tables)_(\d+)$/);
      if (!match) {
        return;
      }

      const kind = match[1];
      const groupIndex = match[2];
      const groupId = `group_${groupIndex}`;
      const group = groupMap.get(groupId) ?? {
        id: groupId,
        fields: [],
        tables: [],
        order: Number(groupIndex),
      };

      const value = sectionGroup[key];
      if (kind === 'fields') {
        group.fields = Array.isArray(value) ? value : [];
        this.orderedSectionBlocks.push({
          key,
          kind: 'fields',
          order: index,
          fields: group.fields,
        });
      } else {
        group.tables = Array.isArray(value) ? value : [];
        this.orderedSectionBlocks.push({
          key,
          kind: 'tables',
          order: index,
          tables: group.tables,
        });
      }

      groupMap.set(groupId, group);
    });

    this.orderedSectionGroups = Array.from(groupMap.values()).sort(
      (a, b) => a.order - b.order,
    );
    this.orderedSectionBlocks.sort((a, b) => a.order - b.order);
    this.hasSectionGroups = this.orderedSectionGroups.length > 0;

    if (this.hasSectionGroups) {
      const mergedFields = this.orderedSectionGroups.flatMap(
        (group) => group.fields || [],
      );
      const mergedTables = this.orderedSectionGroups.flatMap(
        (group) => group.tables || [],
      );
      this.section = {
        ...this.section,
        fields: mergedFields,
        tables: mergedTables,
      };
    }
  }

  onGroupedFieldChange(
    blockKey: string,
    fieldIndex: number,
    updatedField: DynamicFieldSchema,
  ): void {
    const block = this.orderedSectionBlocks.find(
      (item) => item.key === blockKey && item.kind === 'fields',
    );
    if (!block) return;

    const updatedGroupFields = [...(block.fields || [])];
    updatedGroupFields[fieldIndex] = updatedField;
    block.fields = updatedGroupFields;
    this.syncGroupFromBlock(blockKey, 'fields', updatedGroupFields);
    const updatedSectionGroup = this.updateSectionGroupBlock(
      blockKey,
      updatedGroupFields,
    );

    const mergedFields = this.orderedSectionGroups.flatMap(
      (group) => group.fields || [],
    );
    this.section = {
      ...this.section,
      sectionGroup: updatedSectionGroup,
      fields: mergedFields,
    };

    this.sectionChange.emit(this.section);
  }

  onGroupedTableRowsChange(
    blockKey: string,
    tableIndex: number,
    rows: any[],
  ): void {
    const block = this.orderedSectionBlocks.find(
      (item) => item.key === blockKey && item.kind === 'tables',
    );
    if (!block) return;

    const updatedGroupTables = [...(block.tables || [])];
    const updatedTable = {
      ...updatedGroupTables[tableIndex],
      rows,
    };
    updatedGroupTables[tableIndex] = updatedTable;
    block.tables = updatedGroupTables;
    this.syncGroupFromBlock(blockKey, 'tables', updatedGroupTables);
    const updatedSectionGroup = this.updateSectionGroupBlock(
      blockKey,
      updatedGroupTables,
    );

    const mergedTables = this.orderedSectionGroups.flatMap(
      (group) => group.tables || [],
    );
    this.section = {
      ...this.section,
      sectionGroup: updatedSectionGroup,
      tables: mergedTables,
    };

    this.sectionChange.emit(this.section);
  }

  onGroupedNestedTableChange(
    blockKey: string,
    tableIndex: number,
    updatedTable: DynamicTableSchema,
  ): void {
    this.updateGroupedNestedTables(blockKey, (tables) => {
      const nextTables = [...tables];
      nextTables[tableIndex] = updatedTable;
      return nextTables;
    });
  }

  onGroupedNestedTableCopy(blockKey: string, tableIndex: number, event: any): void {
    const copiedTable = this.resolveCopiedNestedTable(event);
    this.updateGroupedNestedTables(blockKey, (tables) => [
      ...tables.slice(0, tableIndex + 1),
      copiedTable,
      ...tables.slice(tableIndex + 1),
    ]);
  }

  onGroupedNestedTableRemove(blockKey: string, tableIndex: number): void {
    this.updateGroupedNestedTables(blockKey, (tables) => {
      if (tables.length <= 1) {
        alert('At least one table is required.');
        return tables;
      }

      return tables.filter((_, index) => index !== tableIndex);
    });
  }

  onFieldChange(index: number, updatedField: DynamicFieldSchema): void {
    const updatedFields = [...this.section.fields];
    updatedFields[index] = updatedField;

    this.section = {
      ...this.section,
      fields: updatedFields,
    };

    this.sectionChange.emit(this.section);
  }

  onTableRowsChange(tableIndex: number, rows: any[]): void {
    const updatedTables = [...this.section.tables];
    updatedTables[tableIndex] = {
      ...updatedTables[tableIndex],
      rows,
    };

    this.section = {
      ...this.section,
      tables: updatedTables,
    };

    this.sectionChange.emit(this.section);
  }

  onNestedTableChange(tableIndex: number, updatedTable: DynamicTableSchema): void {
    const updatedTables = [...this.section.tables];
    updatedTables[tableIndex] = updatedTable;

    this.section = {
      ...this.section,
      tables: updatedTables,
    };

    this.sectionChange.emit(this.section);
  }

  onNestedTableCopy(tableIndex: number, event: any): void {
    const copiedTable = this.resolveCopiedNestedTable(event);

    this.section = {
      ...this.section,
      tables: [
        ...this.section.tables.slice(0, tableIndex + 1),
        copiedTable,
        ...this.section.tables.slice(tableIndex + 1),
      ],
    };

    this.sectionChange.emit(this.section);
  }

  onNestedTableRemove(tableIndex: number): void {
    if (this.section.tables.length <= 1) {
      alert('At least one table is required.');
      return;
    }

    this.section = {
      ...this.section,
      tables: this.section.tables.filter((_, index) => index !== tableIndex),
    };

    this.sectionChange.emit(this.section);
  }

  onTableDataChange(tableId: string, data: any[]): void {
    this.tableDataChange.emit({ tableId, data });
  }

  isNestedDynamicTable(table: DynamicTableSchema): boolean {
    return table?.sectionType === 'nestedDynamicTable';
  }

  isTableVisible(table: DynamicTableSchema): boolean {
    return this.visibilityService.isVisible(table, this.formData || {});
  }

  private syncGroupFromBlock(
    blockKey: string,
    kind: 'fields' | 'tables',
    value: DynamicFieldSchema[] | DynamicTableSchema[],
  ): void {
    const match = blockKey.match(/^(fields|tables)_(\d+)$/);
    if (!match) return;

    const groupId = `group_${match[2]}`;
    const groupIndex = this.orderedSectionGroups.findIndex(
      (group) => group.id === groupId,
    );
    if (groupIndex < 0) return;

    const currentGroup = this.orderedSectionGroups[groupIndex];
    const updatedGroup =
      kind === 'fields'
        ? { ...currentGroup, fields: value as DynamicFieldSchema[] }
        : { ...currentGroup, tables: value as DynamicTableSchema[] };

    this.orderedSectionGroups = [
      ...this.orderedSectionGroups.slice(0, groupIndex),
      updatedGroup,
      ...this.orderedSectionGroups.slice(groupIndex + 1),
    ];
  }

  private updateGroupedNestedTables(
    blockKey: string,
    updater: (tables: DynamicTableSchema[]) => DynamicTableSchema[],
  ): void {
    const block = this.orderedSectionBlocks.find(
      (item) => item.key === blockKey && item.kind === 'tables',
    );
    if (!block) return;

    const updatedGroupTables = updater([...(block.tables || [])]);
    if (updatedGroupTables === block.tables) return;

    block.tables = updatedGroupTables;
    this.syncGroupFromBlock(blockKey, 'tables', updatedGroupTables);
    const updatedSectionGroup = this.updateSectionGroupBlock(blockKey, updatedGroupTables);
    const mergedTables = this.orderedSectionGroups.flatMap((group) => group.tables || []);

    this.section = {
      ...this.section,
      sectionGroup: updatedSectionGroup,
      tables: mergedTables,
    };

    this.sectionChange.emit(this.section);
  }

  private resolveCopiedNestedTable(event: any): DynamicTableSchema {
    const copiedTable = event?.table ?? event;
    return structuredClone(copiedTable);
  }

  private updateSectionGroupBlock(
    blockKey: string,
    value: DynamicFieldSchema[] | DynamicTableSchema[],
  ): any {
    const currentSectionGroup =
      this.section?.sectionGroup &&
      typeof this.section.sectionGroup === 'object'
        ? this.section.sectionGroup
        : this.sectionGroup && typeof this.sectionGroup === 'object'
          ? this.sectionGroup
          : {};

    return {
      ...currentSectionGroup,
      [blockKey]: value,
    };
  }

  isHtml(value: string): boolean {
    if (!value) return false;

    const htmlRegex = /<\/?[a-z][\s\S]*>/i;
    return htmlRegex.test(value);
  }
}
