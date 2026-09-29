import { ChangeDetectorRef } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
// import {
//   resolveTrialQueryParam,
//   trialRowFromGetFormResponse,
// } from '../../../../../utils/trial-route-prefill';
import {
  SegSelectOption,
  mergeTrialOptionsFromTrial,
  resolveTrialSectionIds,
  resolveTrialShipId,
  resolveTrialSubsystemId,
  resolveTrialSystemId,
} from './seg-trial-prefill.shared';
import { ApiService, RequestParams } from '../../api.service';
import { Apiendpoints } from '../../ApiEndPoints';
import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { resolveTrialQueryParam, trialRowFromGetFormResponse } from '../../trial-route-prefill';

/** Load systems/subsystems then patch form (single-select cascade). */
export async function applySegSystemSubsystemPrefill(ctx: {
  api: ApiService;
  form: FormGroup;
  trialRow: Record<string, unknown> | null;
  patch: Record<string, unknown>;
  systemOptions: SegSelectOption[];
  subsystemOptions: SegSelectOption[];
  setSystemOptions: (opts: SegSelectOption[]) => void;
  setSubsystemOptions: (opts: SegSelectOption[]) => void;
  cdr: ChangeDetectorRef;
  shipId?: string | number;
}): Promise<void> {
  const trial = ctx.trialRow;
  const ship =
    ctx.shipId ??
    resolveTrialShipId(trial) ??
    ctx.patch['ship_name'];
  const systemId =
    ctx.patch['system'] || resolveTrialSystemId(trial);
  const subsystemId =
    ctx.patch['subsystem'] ||
    ctx.patch['sub_system'] ||
    resolveTrialSubsystemId(trial);

  if (systemId) ctx.patch['system'] = String(systemId);
  if (subsystemId) {
    ctx.patch['subsystem'] = String(subsystemId);
    ctx.patch['sub_system'] = String(subsystemId);
  }

  const finish = () => {
    ctx.form.patchValue(ctx.patch, { emitEvent: false });
    setTimeout(() => {
      if (systemId) {
        ctx.form.get('system')?.setValue(String(systemId), { emitEvent: false });
      }
      if (subsystemId) {
        const key = ctx.form.get('subsystem')
          ? 'subsystem'
          : ctx.form.get('sub_system')
            ? 'sub_system'
            : null;
        if (key) {
          ctx.form.get(key)?.setValue(String(subsystemId), { emitEvent: false });
        }
      }
      ctx.cdr.detectChanges();
    }, 0);
  };

  ctx.setSystemOptions(mergeTrialOptionsFromTrial(ctx.systemOptions, trial, 'system'));

  if (!ship) {
    finish();
    return;
  }

  const params: RequestParams = { ship };
  const sectionIds = resolveTrialSectionIds(trial);
  if (sectionIds) params['section'] = sectionIds;

  await new Promise<void>((resolve) => {
    ctx.api
      .getDropdownData(Apiendpoints.MASTER_SYSTEM, { labelKey: 'name', valueKey: 'id' }, params)
      .subscribe({
        next: (res) => {
          ctx.setSystemOptions(
            mergeTrialOptionsFromTrial(
              res.map((o) => ({ label: o.label, value: String(o.value) })),
              trial,
              'system',
            ),
          );
          if (!systemId) {
            finish();
            resolve();
            return;
          }
          ctx.api
            .getDropdownData(
              'master/subsystems/',
              { labelKey: 'name', valueKey: 'id' },
              { system: systemId } as RequestParams,
            )
            .subscribe({
              next: (subRes) => {
                ctx.setSubsystemOptions(
                  mergeTrialOptionsFromTrial(
                    subRes.map((o) => ({
                      label: o.label,
                      value: String(o.value),
                    })),
                    trial,
                    'subsystem',
                  ),
                );
                finish();
                resolve();
              },
              error: () => {
                ctx.setSubsystemOptions(
                  mergeTrialOptionsFromTrial([], trial, 'subsystem'),
                );
                finish();
                resolve();
              },
            });
        },
        error: () => {
          ctx.setSystemOptions(mergeTrialOptionsFromTrial([], trial, 'system'));
          finish();
          resolve();
        },
      });
  });
}

export async function loadSegTrialContext(ctx: {
  formApi: FormApiService;
  route: ActivatedRoute;
  router: Router;
  formKey: string;
}): Promise<{
  trialId: string;
  trialRow: Record<string, unknown>;
  jsonSaved: Record<string, unknown> | null;
} | null> {
  const trialId = resolveTrialQueryParam(ctx.route, ctx.router);
  if (!trialId) return null;

  ctx.formApi.setCurrentForm(trialId, ctx.formKey);
  const response = await ctx.formApi.getForm(trialId);
  const trialRow = trialRowFromGetFormResponse(ctx.formApi, response) as Record<
    string,
    unknown
  > | null;
  if (!trialRow) return null;

  let jsonSaved = resolveSegTrialJsonSaved(trialRow, response);

  if (!jsonSaved) {
    const nomenclature = ctx.formApi.resolveNomenclature(
      trialRow['equipment_details'] &&
        Array.isArray(trialRow['equipment_details'])
        ? (trialRow['equipment_details'] as unknown[])[0]
        : null,
    );
    jsonSaved = await ctx.formApi.fetchTrialDraftData(trialId, nomenclature);
  }

  return { trialId, trialRow, jsonSaved };
}

function parseJsonObject(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === 'null') return null;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }

  return null;
}

function hasSavedJsonContent(saved: Record<string, unknown> | null): boolean {
  return !!saved && Object.keys(saved).length > 0;
}

/** Prefer trial `json_data`; otherwise draft/form response (`data` bucket). */
export function resolveSegTrialJsonSaved(
  trialRow: Record<string, unknown>,
  formResponse: unknown,
): Record<string, unknown> | null {
  const fromTrial = parseJsonObject(trialRow['json_data']);
  if (hasSavedJsonContent(fromTrial)) return fromTrial;

  const fromResponse = parseJsonObject(formResponse);
  if (!fromResponse) return null;

  const wrappedJsonData = parseJsonObject(fromResponse['json_data']);
  if (hasSavedJsonContent(wrappedJsonData)) return wrappedJsonData;

  const wrappedData = parseJsonObject(fromResponse['data']);
  if (hasSavedJsonContent(wrappedData)) return wrappedData;

  if (hasSavedJsonContent(fromResponse)) return fromResponse;

  return null;
}
