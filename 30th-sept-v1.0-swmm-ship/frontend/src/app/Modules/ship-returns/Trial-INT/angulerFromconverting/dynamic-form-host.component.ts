import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, inject } from '@angular/core';
import {
  DynamicFormRendererComponent,
  DynamicFormSchema,
} from './dynamic-form-renderer.component';
import { DynamicFormSchemaService } from './dynamic-form-schema.service';
import { FormApiService } from './form-api.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-dynamic-form-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full',
  },
  imports: [CommonModule, DynamicFormRendererComponent],
  template: `
    <div class="mx-auto flex h-full max-w-8xl flex-col" *ngIf="schema">
      <app-dynamic-form-renderer
        [schema]="schema"
        [autosave]="false"
        [context]="context"
        (schemaChange)="schema = $event"
        (formValueChange)="onChange($event)"
        (draftSave)="onDraft($event)"
        (formSubmit)="onSubmit($event)"
        (equipmentChange)="onEquipmentChange($event)"
      ></app-dynamic-form-renderer>
    </div>
  `,
})
export class DynamicFormHostComponent implements OnInit {
  schema!: DynamicFormSchema;
  payload: any = {};

  // private readonly sectionGroupLogTag = '[DynamicFormHost][sectionGroup]';
  context: any = {};
  private baseSchema!: DynamicFormSchema;
  private formName = '';
  private schemaLoadedFromApi = false;
  private trialId: string | null = null;

  private readonly service = inject(DynamicFormSchemaService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly route = inject(ActivatedRoute);
  private readonly fronAPI = inject(FormApiService);

  async ngOnInit(): Promise<void> {
    let baseSchema: DynamicFormSchema;
    let data: any = {};

    try {
       const formName =
         this.route.snapshot.params['formName'] ||
         this.route.snapshot.url.at(-1)?.path ||
         '';
      this.formName = formName;
      const getId = this.route.snapshot.queryParams['trial'];
      this.trialId = getId ?? null;

      this.fronAPI.setCurrentForm(getId, formName);
      const response = await this.fronAPI.getForm(getId);
      const apiData = this.extractPayload(response);
      data = apiData;
      const schema = await this.service.loadSchemaFromAssets(formName);
      this.schemaLoadedFromApi = this.service.lastSchemaSource === 'api';
      this.baseSchema = this.service.normalizeSchema(
        schema,
      );
      baseSchema = this.baseSchema;
      this.logSectionGroupPresence(baseSchema, 'baseSchema');
    } catch (error) {
      console.error('Failed to load schema JSON dynamically.', error);
      return;
    }

    const patchedSchema = this.service.patchSchema(baseSchema, data);
    this.logSectionGroupPresence(patchedSchema, 'patchedSchema');

    try {
      this.schema = await this.service.enrichSchema(patchedSchema, this.fronAPI?.context, data);
      this.logSectionGroupPresence(this.schema, 'enrichedSchema');
      this.logMasterTableState(data, this.schema);
      this.logFieldPatchState(data, this.schema);
      this.cdr.detectChanges();
    } catch (error) {
      this.schema = patchedSchema;
      this.logSectionGroupPresence(this.schema, 'fallbackPatchedSchema');
      this.cdr.markForCheck();
      console.warn('Schema enrichment failed, rendering base schema.', error);
    }
  }

  /** DEBUG fills gaps only; API/draft data wins on same keys */
  // private mergePatchData(apiData: any): any {
  //   if () return apiData ?? {};
  //   return {  ...(apiData ?? {}) };
  // }

  private extractPayload(response: any): any {
    const firstDataRow = Array.isArray(response?.data) ? response.data[0] : undefined;
    const source = firstDataRow || response?.data || response || {};

    if (!source || typeof source !== 'object') {
      return {};
    }

    this.context = { ...this.context, ...source };

    if (source?.json_data && typeof source.json_data === 'object') {
      return source.json_data;
    }

    if (source?.data && typeof source.data === 'object') {
      return source.data;
    }

    const payload = { ...source };
    delete payload.json_data;
    delete payload.data;
    return payload;
  }

  private logFieldPatchState(patchData: any, schema: DynamicFormSchema): void {
    const section = schema?.sections?.[0];
    const sampleFields = (section?.fields || []).map((field: any) => ({
      name: field.name,
      patchValue: patchData?.[field.name],
      schemaValue: field.value,
    }));
    // console.log('[DynamicFormHost][fieldPatch]', sampleFields);
  }

  private logMasterTableState(patchData: any, schema: DynamicFormSchema): void {
    const located = this.findTableById(schema, 'checks_from_master');
    console.log('[DynamicFormHost][checks_from_master]', {
      sectionId: located?.sectionId,
      sectionIndex: located?.sectionIndex,
      patchRowCount: patchData?.checks_from_master?.length ?? 0,
      renderedRowCount: located?.table?.rows?.length ?? 0,
      sampleRow: located?.table?.rows?.[0]?.cells?.map((cell: any) => ({
        key: cell.key,
        type: cell.type,
        value: cell.value,
      })),
    });
  }

  private findTableById(
    schema: DynamicFormSchema,
    tableId: string,
  ): { table: any; sectionId: string; sectionIndex: number } | null {
    for (let sectionIndex = 0; sectionIndex < (schema?.sections || []).length; sectionIndex++) {
      const section = schema.sections[sectionIndex];
      for (const table of section?.tables || []) {
        if (table?.id === tableId) {
          return { table, sectionId: section.id, sectionIndex };
        }
      }
    }
    return null;
  }

  onChange(data: any) {
    this.payload = data;
    this.fronAPI.setLiveFormData(data);
  }

  onDraft(data: any) {
    this.payload = data;
    this.fronAPI.setLiveFormData(data);
    console.log('SAVE DRAFT API CALL', data);
  }

  onSubmit(data: any) {
    this.payload = data;
    this.fronAPI.setLiveFormData(data);
    console.log('SUBMIT API CALL', data);
  }

  async onEquipmentChange(event: { nomenclature?: string }): Promise<void> {
    if (!this.trialId || !this.baseSchema) return;

    try {
      const response = await this.fronAPI.getFormByEquipment(
        this.trialId,
        event?.nomenclature || '',
      );
      const apiData = this.extractPayload(response);
      const data =apiData;
      this.fronAPI.setLiveFormData(data);
      const baseSchema = this.schemaLoadedFromApi
        ? this.service.normalizeSchema(await this.service.loadSchemaFromAssets(this.formName))
        : this.baseSchema;

      if (this.schemaLoadedFromApi) {
        this.baseSchema = baseSchema;
        this.schemaLoadedFromApi = this.service.lastSchemaSource === 'api';
      }

      const patchedSchema = this.service.patchSchema(baseSchema, data);

      try {
        this.schema = await this.service.enrichSchema(
          patchedSchema,
          this.fronAPI.context,
          data,
        );
      } catch (error) {
        this.schema = patchedSchema;
        console.warn('Schema enrichment failed on equipment change.', error);
      }

      this.cdr.detectChanges();
    } catch (error) {
      console.error('Failed to load form data for equipment.', error);
    }
  }

  private logSectionGroupPresence(schema: DynamicFormSchema, stage: string): void {
    const sections = schema?.sections || [];
    const sectionsWithGroup = sections.filter((section: any) => {
      const sectionGroup = section?.sectionGroup;
      return !!sectionGroup && typeof sectionGroup === 'object' && Object.keys(sectionGroup).length > 0;
    });

    // console.log(`${this.sectionGroupLogTag} stage=${stage}`, {
    //   totalSections: sections.length,
    //   sectionsWithSectionGroup: sectionsWithGroup.length,
    //   sectionIds: sectionsWithGroup.map((section: any) => section.id),
    //   sampleGroupKeys: sectionsWithGroup[0]?.sectionGroup ? Object.keys(sectionsWithGroup[0].sectionGroup) : [],
    // });
  }
}
