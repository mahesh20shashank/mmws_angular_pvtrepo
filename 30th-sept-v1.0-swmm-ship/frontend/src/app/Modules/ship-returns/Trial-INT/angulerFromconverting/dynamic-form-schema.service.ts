import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../api.service';
import { FormApiService } from './form-api.service';
import { ActivatedRoute } from '@angular/router';
import { Apiendpoints, equipmentHtml } from '../ApiEndPoints';

@Injectable({ providedIn: 'root' })
export class DynamicFormSchemaService {
  lastSchemaSource: 'assets' | 'api' | null = null;

  constructor(
    private apiService: ApiService,
    private formApi: FormApiService,
    private route: ActivatedRoute,
    
  ) {}

  private endpointMap: Record<
    string,
    { endpoint: string; labelKey: string; valueKey: string; htmlTag?: string }
  > = {
    ships: { endpoint: Apiendpoints.MASTER_SHIP, labelKey: 'name', valueKey: 'id' },
    ship_id: { endpoint: Apiendpoints.MASTER_SHIP, labelKey: 'name', valueKey: 'id' },
    equipment_id: { endpoint: Apiendpoints.MASTER_EQUIPMENT, ...equipmentHtml },
    vibTrialBBearingDE: { endpoint: Apiendpoints.MASTER_BEARING, labelKey: 'name', valueKey: 'id' },
    vibTrialBOccasion: { endpoint: Apiendpoints.MASTER_OCCASION, labelKey: 'name', valueKey: 'id' },
    vibTrialBRemark: { endpoint: Apiendpoints.MASTER_REMARK, labelKey: 'name', valueKey: 'id' },
    vibTrialBStatus: { endpoint: Apiendpoints.MASTER_STATUS, labelKey: 'name', valueKey: 'id' },
    systems: { endpoint: Apiendpoints.MASTER_SYSTEM, labelKey: 'name', valueKey: 'id' },
    compartments: { endpoint: Apiendpoints.MASTER_COMPARTMENT, labelKey: 'name', valueKey: 'id' },
    units: { endpoint: Apiendpoints.MASTER_UNIT, labelKey: 'unit_name', valueKey: 'unit_id' },
    unit_id: { endpoint: Apiendpoints.MASTER_UNIT, labelKey: 'unit_name', valueKey: 'unit_id' },
    unit_name: { endpoint: Apiendpoints.MASTER_UNIT, labelKey: 'unit_name', valueKey: 'unit_name' },
    subsystems: { endpoint: Apiendpoints.MASTER_SUB_MODULE, labelKey: 'sub_module_name', valueKey: 'sub_module_id' },
  };

  normalizeSchema(schema: any): any {
    return this.normalizeParserSchema(structuredClone(schema));
  }

  async enrichSchema(schema: any, context: any = {}, patchData: any = {}): Promise<any> {
    let updated = structuredClone(schema);
    updated = this.applyPrefill(updated, context);
    updated = await this.applyLookups(updated, context);
    updated = await this.applyTableRowSources(updated, context, patchData);

    // Re-apply draft/saved values after rowSource build (normalize/row clone can reset cells).
    if (patchData && Object.keys(patchData).length > 0) {
      updated = this.patchSchema(updated, patchData);
    }

    // Equipment metadata belongs to the selected tab and must win over saved form values.
    updated = this.applyPrefill(updated, context);

    return updated;
  }

  private normalizeParserSchema(schema: any): any {
    schema.sections = (schema.sections || []).map((section: any, sectionIndex: number) => ({
      id: section.id || section.key || `section_${sectionIndex + 1}`,
      title: section.title || `Section ${sectionIndex + 1}`,
      sectionType: section.sectionType || this.resolveSectionType(section),
      sectionGroup: this.normalizeSectionGroup(section.sectionGroup, sectionIndex),
      fields: (section.fields || []).map((field: any) => this.normalizeField(field)),
      tables: (section.tables || []).map((table: any, tableIndex: number) => this.normalizeTable(table, sectionIndex, tableIndex)),
    }));

    return schema;
  }

  private normalizeSectionGroup(sectionGroup: any, sectionIndex: number): any {
    if (!sectionGroup || typeof sectionGroup !== 'object') return sectionGroup;

    const normalized: any = {};
    Object.entries(sectionGroup).forEach(([key, value]) => {
      const match = key.match(/^(fields|tables)_(\d+)$/);
      if (!match || !Array.isArray(value)) {
        normalized[key] = value;
        return;
      }

      if (match[1] === 'fields') {
        normalized[key] = value.map((field: any) => this.normalizeField(field));
      } else {
        const groupIdx = Number(match[2]) || 0;
        normalized[key] = value.map((table: any, tableIndex: number) =>
          this.normalizeTable(table, sectionIndex, groupIdx * 100 + tableIndex),
        );
      }
    });

    return normalized;
  }

  private resolveSectionType(section: any): 'fields' | 'simpleTable' | 'matrixTable' | 'hybrid' {
    const hasFields = !!section.fields?.length;
    const hasTables = !!section.tables?.length;
    if (hasFields && hasTables) return 'hybrid';
    if (hasTables) return 'matrixTable';
    return 'fields';
  }

  private normalizeCheckboxMultipleValue(value: any): any[] {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined || value === '') return [];
    return [value];
  }

  private normalizeField(field: any): any {
    const normalizedType = this.normalizeFieldType(field.type, field.inputType);
    const name = field.name || field.key;
    const rawValue = field.value ?? field.defaultValue ?? '';
    const value =
      normalizedType.type === 'checkbox-multiple'
        ? this.normalizeCheckboxMultipleValue(rawValue)
        : rawValue;

    return {
      ...field,
      type: normalizedType.type,
      inputType: normalizedType.inputType,
      colSpan: Number(field.colSpan ?? field.colspan) || 6,
      name,
      key: field.key || name,
      value,
      options: field.options || [],
      searchable: this.resolveSearchable(field.isDynamic),
      isDynamic: this.resolveIsDynamic(field),
      lookupKey: field.lookupKey || this.inferLookupKey(name),
    };
  }

  private normalizeTable(table: any, sectionIndex: number, tableIndex: number): any {
    return {
      ...table,
      id: table.id || table.key || `table_${sectionIndex + 1}_${tableIndex + 1}`,
      sectionType: table.sectionType || 'matrixTable',
      title: table.title || '',
      topHeaders: table.topHeaders || [],
      columns: table.columns || [],
      rows: (table.rows || []).map((row: any) => ({
        ...row,
        cells: (row.cells || []).map((cell: any) => this.normalizeCell(cell)),
      })),
      showRowActions: table.showRowActions ?? false,
      minRows: table.minRows ?? 1,
    };
  }

  private normalizeCell(cell: any): any {
    const normalizedType = this.normalizeFieldType(cell.type, cell.inputType);
    const key = cell.key || cell.name;
     // ✅ ADD THIS BLOCK for notes fields
  if (normalizedType.type === 'notes') {
    return {
      ...cell,
      key,
      name: cell.name || key,
      type: 'notes',
      value: cell.value ?? cell.defaultValue ?? '',
      notesHeading: cell.notesHeading,
      notesDescription: cell.notesDescription,
      notesListType: cell.notesListType,
      notesItems: cell.notesItems,
      notesClass: cell.notesClass,
      notesHeadingClass: cell.notesHeadingClass,
    };
  }
    return {
      ...cell,
      key,
      name: cell.name || key,
      type: normalizedType.type === 'tree-select' ? 'select' : normalizedType.type,
      inputType: normalizedType.inputType,
      value: cell.value ?? cell.defaultValue ?? '',
      options: cell.options || [],
      searchable: this.resolveSearchable(cell.isDynamic),
      isDynamic: this.resolveIsDynamic(cell),
      lookupKey: cell.lookupKey || this.inferLookupKey(key),
    };
  }

  private resolveIsDynamic(node: any): boolean {
    // Respect explicit false from schema; infer only when value is not provided.
    if (typeof node?.isDynamic === 'boolean') return node.isDynamic;
    return !!node?.lookupKey || !!node?.api;
  }

  private resolveSearchable(value: any): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['false', '0', 'no', 'off', ''].includes(normalized)) return false;
      if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    }
    return !!value;
  }

  private normalizeFieldType(type: string, inputType?: string): { type: string; inputType: string } {
    const t = String(type || 'input').toLowerCase();
    if (['text', 'email', 'number', 'password'].includes(t)) return { type: 'input', inputType: t };
    if (t === 'input') return { type: 'input', inputType: inputType || 'text' };
    if (t === 'tree' || t === 'tree-select') return { type: 'tree-select', inputType: 'text' };
    if (t === 'multi-select') return { type: 'multiselect', inputType: inputType || 'text' };
    //Notes added here 
    if (
      ['textarea', 'select', 'multiselect', 'date', 'time', 'checkbox', 'checkbox-multiple', 'radio', 'file', 'label', 'serial', 'notes', 'editor'].includes(t)
    ) {
      return { type: t, inputType: inputType || 'text' };
    }
    return { type: 'input', inputType: inputType || 'text' };
  }

  private inferLookupKey(name: string): string | null {
    if (!name) return null;
    const key = String(name).toLowerCase();
    if (this.endpointMap[key]) return key;
    if (key.includes('ship')) return 'ships';
    if (key.includes('system')) return 'systems';
    if (key.includes('unit')) return 'units';
    if (key.includes('subsystem') || key.includes('sub_system')) return 'subsystems';
    return null;
  }

  applyPrefill(schema: any, context: any): any {
    const selectedEquipment = this.resolveSelectedEquipment(context);
    const apply = (node: any) => {
      if (!node) return;

      if (node.prefill && node.prefillSource) {
        const source = String(node.prefillSource);
        const isEquipmentSource = source.startsWith('equipment.');
        const key = source.replace(/^(context|equipment)\./, '');
        const sourceObject = isEquipmentSource ? selectedEquipment : context;
        const value = this.resolvePathValue(sourceObject, key);

        if (value !== undefined) {
          node.value = value;
          if (node.lockAfterPrefill || isEquipmentSource) node.disabled = true;
        }
      }

      if (node.hiddenKey && context[node.hiddenKey] !== undefined) {
        node.hiddenValue = context[node.hiddenKey];
      }
    };

    schema.sections?.forEach((section: any) => {
      this.getSectionBlocks(section).forEach((block) => {
        block.fields?.forEach(apply);
        block.tables?.forEach((table: any) => {
          table.rows?.forEach((row: any) => row.cells?.forEach(apply));
        });
      });
    });

    return schema;
  }

  private resolveSelectedEquipment(context: any): any {
    const equipment = this.formApi?.currentEquipmentNomenclature;
    if (equipment && typeof equipment === 'object') return equipment;

    const equipmentList = context?.equipment_details || context?.system_details;
    return Array.isArray(equipmentList) ? equipmentList[0] || null : null;
  }

  private getSectionBlocks(section: any): Array<{ fields: any[]; tables: any[] }> {
    const blocks: Array<{ fields: any[]; tables: any[] }> = [
      {
        fields: section?.fields || [],
        tables: section?.tables || [],
      },
    ];

    const sectionGroup = section?.sectionGroup;
    if (!sectionGroup || typeof sectionGroup !== 'object') return blocks;

    const grouped = new Map<number, { fields: any[]; tables: any[] }>();
    Object.entries(sectionGroup).forEach(([key, value]) => {
      const match = key.match(/^(fields|tables)_(\d+)$/);
      if (!match || !Array.isArray(value)) return;

      const groupIndex = Number(match[2]);
      const group = grouped.get(groupIndex) || { fields: [], tables: [] };
      if (match[1] === 'fields') group.fields = value;
      if (match[1] === 'tables') group.tables = value;
      grouped.set(groupIndex, group);
    });

    return [...blocks, ...Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]).map(([, group]) => group)];
  }

  async applyLookups(schema: any, context: any = {}): Promise<any> {
    const cache = new Map<string, any[]>();
    const formData = this.collectSchemaValues(schema);

    const load = async (node: any) => {
      if (!node) return;
      const existingOptions = Array.isArray(node.options) ? node.options : [];
      const dynamicUrl = node.api?.url || node.api?.endpoint;
      const lookupKey = node.lookupKey;
      const endpoint = lookupKey ? this.endpointMap[String(lookupKey)] : null;
      const isDynamic = node.isDynamic === true;

      if (!isDynamic) return;
      if (!dynamicUrl && !endpoint) return;

      if (dynamicUrl && !this.hasTemplateValues(node.api?.params, context, formData)) {
        node.options = existingOptions;
        return;
      }

      const params = dynamicUrl ? this.resolveContextParams(node.api?.params, context, formData, true) : {};
      const cacheKey = dynamicUrl ? `${dynamicUrl}|${JSON.stringify(params)}` : lookupKey;
      if (!cacheKey) return;

      if (!cache.has(cacheKey)) {
        try {
          let raw: any;
          if (dynamicUrl) {
            raw = await firstValueFrom((this.apiService as any).get(dynamicUrl, params));
          } else if (endpoint) {
            raw = await firstValueFrom(
              this.apiService.getDropdownData(endpoint.endpoint, {
                labelKey: endpoint.labelKey as any,
                valueKey: endpoint.valueKey as any,
                htmlTag: endpoint.htmlTag,
              }),
            );
          }

          const labelKey = node.api?.labelKey || endpoint?.labelKey || 'label';
          const valueKey = node.api?.valueKey || endpoint?.valueKey || 'value';
          const childrenKey = node.api?.childrenKey || 'children';
          const responsePath = node.api?.responsePath;
          const list = this.extractList(raw, responsePath);
          const nextOptions = this.toOptions(list, labelKey, valueKey, childrenKey);
          // If lookup returned empty, keep schema-provided options as fallback.
          cache.set(cacheKey, nextOptions.length ? nextOptions : existingOptions);
        } catch (error) {
          // Preserve existing options so select/multiselect stays usable.
          cache.set(cacheKey, existingOptions);
        }
      }

      node.options = cache.get(cacheKey) || existingOptions;
    };

    for (const section of schema.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) await load(field);
        for (const table of block.tables || []) {
          for (const row of table.rows || []) {
            for (const cell of row.cells || []) await load(cell);
          }
        }
      }
    }

    return schema;
  }

  /**
   * Optional JSON-driven table row hydration (runs only when table.rowSource.api is set).
   * Called from enrichSchema after patchSchema has already applied saved draft values.
   */
  async applyTableRowSources(schema: any, context: any = {}, patchData: any = {}): Promise<any> {
    for (const section of schema.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const table of block.tables || []) {
          await this.hydrateTableRowsFromApi(table, context, patchData);
        }
      }
    }

    return schema;
  }

  private async hydrateTableRowsFromApi(table: any, context: any, patchData: any = {}): Promise<void> {
    const rowSource = table?.rowSource;
    const api = rowSource?.api;
    const url = api?.url || api?.endpoint;

    if (!rowSource || !api || !url) return;

    const templateRow = this.getRowSourceTemplate(table, rowSource);
    if (!templateRow) return;

    const preserveLeadingRows = Number(rowSource.preserveLeadingRows ?? 0);
    const leadingRows =
      preserveLeadingRows > 0 ? (table.rows || []).slice(0, preserveLeadingRows) : [];
    const hideInitialRows = rowSource.hideInitialRows !== false;

    const patchRows = this.getPatchRowsForTable(table.id, patchData, context);
    const hasPatchRows = patchRows.length > 0;

    if (rowSource.skipIfSaved !== false && hasPatchRows && rowSource.preferPatchOverApi !== false) {
      table.rows = this.buildRowsFromApiData(templateRow, patchRows, rowSource, leadingRows);
      this.applyPatchToTableRows(table, patchRows, templateRow);
      return;
    }

    if (hideInitialRows) {
      table.rows = [...leadingRows];
    }

    try {
      const params = this.resolveContextParams(api.params, context);
      const raw = await firstValueFrom((this.apiService as any).get(url, params));
      const items = this.extractList(raw, api.responsePath);

      if (items.length) {
        table.rows = this.buildRowsFromApiData(templateRow, items, rowSource, leadingRows);
      } else if (hasPatchRows) {
        table.rows = this.buildRowsFromApiData(templateRow, patchRows, rowSource, leadingRows);
      } else {
        table.rows = [...leadingRows];
        return;
      }

      if (hasPatchRows) {
        this.mergePatchRowsByMatchKey(table, patchRows, rowSource.patchMatchKey || 'check_name');
      }
    } catch (error) {
      if (hasPatchRows) {
        table.rows = this.buildRowsFromApiData(templateRow, patchRows, rowSource, leadingRows);
        this.applyPatchToTableRows(table, patchRows, templateRow);
      } else {
        table.rows = [...leadingRows];
      }
      console.warn(`[DynamicFormSchema] rowSource API failed for table "${table.id}"`, error);
    }
  }

  private getPatchRowsForTable(tableId: string, patchData: any, context: any): any[] {
    const fromPatchData = patchData?.[tableId];
    if (Array.isArray(fromPatchData) && fromPatchData.length) {
      return fromPatchData;
    }
    return this.getSavedTableRowsFromContext(tableId, context);
  }

  /**
   * Same cell value rules as patchSchema table loop, for rowSource tables after rows are built.
   */
  private mergePatchRowsByMatchKey(table: any, patchRows: any[], matchCellKey: string): void {
    if (!patchRows.length || !table.rows?.length) return;

    const matchKeys = [matchCellKey, 'name', 'check_name'];

    table.rows.forEach((row: any) => {
      const labelCell = (row.cells || []).find((cell: any) => cell.key && matchKeys.includes(cell.key));
      const rowLabel = labelCell?.value;
      if (!rowLabel) return;

      const patchRow = patchRows.find((patch) =>
        matchKeys.some((key) => patch?.[key] !== undefined && String(patch[key]) === String(rowLabel)),
      );
      if (!patchRow) return;

      row.cells = (row.cells || []).map((cell: any) => {
        if (cell.key && patchRow[cell.key] !== undefined) {
          return { ...cell, value: patchRow[cell.key] };
        }
        return cell;
      });
    });
  }

  private applyPatchToTableRows(table: any, tableData: any[], templateRow: any): void {
    if (!Array.isArray(tableData) || !tableData.length) return;

    const existingRows = Array.isArray(table.rows) ? table.rows : [];
    const requiredRowCount = tableData.length;

    if (requiredRowCount > existingRows.length && templateRow) {
      const additionalRows = Array.from({ length: requiredRowCount - existingRows.length }, (_, idx) =>
        this.cloneTableRow(templateRow, existingRows.length + idx + 1),
      );
      table.rows = [...existingRows, ...additionalRows];
    }

    table.rows?.forEach((row: any, rowIndex: number) => {
      const rowData = tableData[rowIndex];
      if (!rowData || typeof rowData !== 'object') return;

      row.cells?.forEach((cell: any) => {
        if (cell.key && rowData[cell.key] !== undefined) {
          cell.value = rowData[cell.key];
        }
        if (cell.hiddenKey && rowData[cell.hiddenKey] !== undefined) {
          cell.hiddenValue = rowData[cell.hiddenKey];
        }
      });
    });
  }

  private getRowSourceTemplate(table: any, rowSource: any): any | null {
    if (rowSource?.templateRow) {
      return structuredClone(rowSource.templateRow);
    }

    const templateRowIndex = Number(rowSource?.templateRowIndex ?? 0);
    const fromRows = table?.rows?.[templateRowIndex];
    return fromRows ? structuredClone(fromRows) : null;
  }

  private getSavedTableRowsFromContext(tableId: string, context: any): any[] {
    const sources = [context?.json_data, context?.data, context];
    for (const source of sources) {
      const rows = source?.[tableId];
      if (Array.isArray(rows) && rows.length) return rows;
    }
    return [];
  }

  private hasSavedTableData(table: any): boolean {
    return (table.rows || []).some((row: any) =>
      (row.cells || []).some((cell: any) => {
        const type = String(cell.type || '').toLowerCase();
        if (!cell.key || ['serial', 'label'].includes(type)) return false;

        const value = cell.value;
        return value !== undefined && value !== null && value !== '';
      }),
    );
  }

  private resolveContextParams(
    params: Record<string, any> | undefined,
    context: any,
    formData: any = {},
    omitEmpty = false,
  ): Record<string, any> {
    if (!params || typeof params !== 'object') return {};

    const resolved: Record<string, any> = {};
    Object.entries(params).forEach(([key, value]) => {
      const nextValue = this.resolveContextValue(value, context, formData);
      if (omitEmpty && (nextValue === null || nextValue === undefined || nextValue === '')) return;
      resolved[key] = nextValue;
    });
    return resolved;
  }

  private resolveContextValue(value: any, context: any, formData: any = {}): any {
    if (value === null || value === undefined) return value;

    if (typeof value === 'string') {
      const exactContextMatch = value.match(/^\{\{\s*context\.([^}]+)\s*\}\}$/);
      if (exactContextMatch) {
        return this.resolvePathValue(context, exactContextMatch[1]);
      }

      const exactFormMatch = value.match(/^\{\{\s*form\.([^}]+)\s*\}\}$/);
      if (exactFormMatch) {
        return this.resolvePathValue(formData, exactFormMatch[1]);
      }

      return value
        .replace(/\{\{\s*context\.([^}]+)\s*\}\}/g, (_, contextKey: string) => {
          const resolved = this.resolvePathValue(context, contextKey);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        })
        .replace(/\{\{\s*form\.([^}]+)\s*\}\}/g, (_, formKey: string) => {
          const resolved = this.resolvePathValue(formData, formKey);
          return resolved !== undefined && resolved !== null ? String(resolved) : '';
        });
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.resolveContextValue(item, context, formData));
    }

    if (typeof value === 'object') {
      const nested: Record<string, any> = {};
      Object.entries(value).forEach(([nestedKey, nestedValue]) => {
        nested[nestedKey] = this.resolveContextValue(nestedValue, context, formData);
      });
      return nested;
    }

    return value;
  }

  private hasTemplateValues(value: any, context: any, formData: any): boolean {
    if (value == null) return true;

    if (typeof value === 'string') {
      const regex = /\{\{\s*(context|form)\.([^}]+)\s*\}\}/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(value))) {
        const source = match[1] === 'context' ? context : formData;
        if (this.isBlankValue(this.resolvePathValue(source, match[2]))) {
          return false;
        }
      }
      return true;
    }

    if (Array.isArray(value)) {
      return value.every((item) => this.hasTemplateValues(item, context, formData));
    }

    if (typeof value === 'object') {
      return Object.values(value).every((item) => this.hasTemplateValues(item, context, formData));
    }

    return true;
  }

  private isBlankValue(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private collectSchemaValues(schema: any): Record<string, any> {
    const values: Record<string, any> = {};

    for (const section of schema?.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) {
          if (field?.name) values[field.name] = field.value;
        }

        for (const table of block.tables || []) {
          for (const row of table.rows || []) {
            for (const cell of row.cells || []) {
              if (cell?.name || cell?.key) values[cell.name || cell.key] = cell.value;
            }
          }
        }
      }
    }

    return values;
  }

  private resolvePathValue(source: any, path: string): any {
    if (!source || !path) return undefined;
    if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];

    return String(path)
      .split('.')
      .reduce((value: any, key: string) => (value == null ? undefined : value[key]), source);
  }

  private buildRowsFromApiData(
    templateRow: any,
    items: any[],
    rowSource: any,
    leadingRows: any[] = [],
  ): any[] {
    const fieldMap: Record<string, string> = rowSource.fieldMap || {};
    const nameApiKey = rowSource.nameKey || 'name';
    const serialOffset = leadingRows.length;

    const generatedRows = items.map((item, index) => {
      const row = this.cloneTableRow(templateRow, serialOffset + index + 1);
      row.cells = (row.cells || []).map((cell: any) => {
        const type = String(cell.type || '').toLowerCase();

        if (type === 'serial') {
          const serialValue =
            item?.[rowSource.serialKey || 'serial'] ??
            item?.trial_ser ??
            String(serialOffset + index + 1).padStart(2, '0');
          return { ...cell, value: String(serialValue) };
        }

        return this.applyApiValueToCell(cell, item, fieldMap, nameApiKey);
      });
      return row;
    });

    return [...leadingRows, ...generatedRows];
  }

  private applyApiValueToCell(
    cell: any,
    item: any,
    fieldMap: Record<string, string>,
    nameApiKey: string,
  ): any {
    const cellKey = cell.key;
    const type = String(cell.type || '').toLowerCase();

    if (!cellKey) return cell;

    if (item[cellKey] !== undefined) {
      return { ...cell, value: item[cellKey] };
    }

    const apiKey =
      Object.entries(fieldMap).find(([, mappedCellKey]) => mappedCellKey === cellKey)?.[0] ||
      (type === 'label' ? nameApiKey : cellKey);

    if (item[apiKey] === undefined) return cell;

    return {
      ...cell,
      value: item[apiKey],
    };
  }

  patchSchema(schema: any, data: any = {}): any {
    const patchedSchema = structuredClone(schema);

    for (const section of patchedSchema.sections || []) {
      for (const block of this.getSectionBlocks(section)) {
        for (const field of block.fields || []) {
          if (data[field.name] !== undefined) field.value = data[field.name];
          if (field.hiddenKey && data[field.hiddenKey] !== undefined) field.hiddenValue = data[field.hiddenKey];
        }

        for (const table of block.tables || []) {
          const tableData = data[table.id];
          if (table?.sectionType === 'nestedDynamicTable' && tableData && typeof tableData === 'object' && !Array.isArray(tableData)) {
            Object.assign(table, structuredClone(tableData), {
              id: table.id,
              sectionType: 'nestedDynamicTable',
            });
            continue;
          }

          if (!Array.isArray(tableData)) continue;

          const existingRows = Array.isArray(table.rows) ? table.rows : [];
          const requiredRowCount = tableData.length;

          if (requiredRowCount > existingRows.length) {
            const templateRow = existingRows[existingRows.length - 1] || existingRows[0];
            if (templateRow) {
              const additionalRows = Array.from({ length: requiredRowCount - existingRows.length }, (_, idx) =>
                this.cloneTableRow(templateRow, existingRows.length + idx + 1),
              );
              table.rows = [...existingRows, ...additionalRows];
            }
          }

          table.rows?.forEach((row: any, rowIndex: number) => {
            const rowData = tableData[rowIndex];
            if (!rowData) return;

            row.cells?.forEach((cell: any) => {
              if (cell.key && rowData[cell.key] !== undefined) cell.value = rowData[cell.key];
              if (cell.hiddenKey && rowData[cell.hiddenKey] !== undefined) cell.hiddenValue = rowData[cell.hiddenKey];
            });
          });
        }
      }
    }

    return patchedSchema;
  }

  private extractList(response: any, responsePath?: string): any[] {
    let data = response;
    if (responsePath) {
      for (const part of String(responsePath).split('.')) {
        if (!part) continue;
        data = data?.[part];
      }
    }
    if (Array.isArray(data)) return data;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.results)) return response.results;
    if (Array.isArray(response?.result)) return response.result;
    return [];
  }

  private toOptions(items: any[], labelKey: string, valueKey: string, childrenKey: string): any[] {
    return (items || []).map((item: any) => ({
      label: item?.[labelKey] ?? item?.label ?? item?.name ?? String(item?.[valueKey] ?? ''),
      value: item?.[valueKey] ?? item?.value ?? item?.id ?? item,
      htmlTag: item?.htmlTag,
      raw: item,
      children: Array.isArray(item?.[childrenKey])
        ? this.toOptions(item[childrenKey], labelKey, valueKey, childrenKey)
        : undefined,
    }));
  }

  private cloneTableRow(templateRow: any, serialNumber: number): any {
    const cloned = structuredClone(templateRow);
    cloned._id = `${templateRow?._id || 'row'}_${serialNumber}`;
    cloned.cells = (cloned.cells || []).map((cell: any, cellIndex: number) => {
      const nextCell = {
        ...cell,
        _id: `${cell?._id || `cell_${cellIndex + 1}`}_${serialNumber}`,
      };

      if (String(nextCell.type || '').toLowerCase() === 'serial') {
        nextCell.value = String(serialNumber);
      } else {
        nextCell.value = '';
      }
      return nextCell;
    });
    return cloned;
  }


  async loadSchemaFromAssets(formName: string): Promise<any> {
    this.lastSchemaSource = null;
  
    const file = `${formName}.json`;
  
    try {
      const res = await fetch(`assets/json/${file}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
// console.log('res====================================================s',res);
       if (res.ok) {
         this.lastSchemaSource = 'assets';
         const json = await res.json();
        //  console.log('jsonx====================================================s1iiii',json);
        return json;
      }
    } catch {}
  
    const equipment = this.formApi?.currentEquipmentNomenclature;
    const equipmentId = equipment?.id;
    if(this.formApi?.context){
      let apiUrl = '';
      const isParameterValuesSchema = ['358','360','362','374','376','378'].includes(
        String(this.formApi?.context?.trial_type_id),
      );
      if(this.formApi?.context?.trial_form_type == 5){
        apiUrl = `/master/refit-form/?ship_id=${this.formApi?.context?.ship_id}&system_name=${this.formApi?.currentEquipmentNomenclature?.name}`;
      } else if (isParameterValuesSchema) {
        apiUrl = `/master/parameter-values-schema/?equipment__id=${equipmentId}&trialtypes_id=${this.formApi?.context?.trial_type_id}`;
      }
      else if(!apiUrl) {throw new Error(`Failed to load schema: ${file} || No API URL found`); return;}

      const apiRes: any = await firstValueFrom(
        this.apiService.get(apiUrl)
        
      );
    
      if (apiRes?.data?.[0]?.schema) {
        this.lastSchemaSource = 'api';
        return apiRes.data[0].schema;
      }

      if (isParameterValuesSchema) {
        this.showParametersNotLinkedPopup(equipment);
      }
    }
    
  
    throw new Error(`Failed to load schema: ${file}`);
  }

  private showParametersNotLinkedPopup(equipment: any): void {
    const equipmentName =
      equipment?.nomenclature || equipment?.name || equipment?.equipment_nomenclature || '';
    const equipmentLine = equipmentName ? `\nEquipment: ${equipmentName}` : '';

    // this.confirmPopup.open({
    //   title: 'Parameters Not Linked',
    //   message: `Parameters are not linked with this form. Please contact your unit admin for this.${equipmentLine}`,
    //   type: 'warning',
    //   confirmText: 'OK',
    //   showCancel: false,
    //   onConfirm: () => window.history.back(),
    // });
  }

}
