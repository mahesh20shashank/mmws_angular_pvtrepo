import { ActivatedRoute, Router } from '@angular/router';
import { FormApiService } from './angulerFromconverting/form-api.service';

export function resolveTrialQueryParam(route: ActivatedRoute, router: Router): string | null {
  let current: ActivatedRoute | null = route;
  while (current) {
    const trialId = current.snapshot.paramMap.get('trialId');
    if (trialId) return trialId;
    const trial = current.snapshot.queryParamMap.get('trial');
    if (trial) return trial;
    current = current.parent;
  }
  const match = router.url.match(/[?&]trial=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export function trialRowFromGetFormResponse(formApi: FormApiService, response: any): any {
  return formApi.context ?? response?.data?.[0] ?? response?.data ?? response;
}

export function trialFillPayload(response: any): any {
  return response?.data ?? response?.json_data ?? response;
}

export async function fetchTrialPrefill(trialId: string, formApi: FormApiService): Promise<any> {
  const response = await formApi.getForm(trialId);
  return {
    trialRow: trialRowFromGetFormResponse(formApi, response),
    response,
    fillPayload: trialFillPayload(response),
  };
}
