import { Injectable } from "@angular/core";

import {
  EQUIPMENT_HISTORY_SECTIONS,
  EQUIPMENT_HISTORY_STATS,
  GUIDANCE,
  OP_ACTIVITY,
  OPM_DART_ROWS,
  RA_STATUS_ROWS,
  UNMAPPED_SPARES,
} from "../opm-actions-fields.config";
import {
  OpmActivityRow,
  OpmApprovalResubmitPayload,
  OpmApprovalRow,
  OpmDartRow,
  OpmDdbSubmitPayload,
  OpmEquipmentHistorySection,
  OpmEquipmentHistoryStat,
  OpmGuaranteeSubmitPayload,
  OpmGuidanceItem,
  OpmRaiseRaPayload,
  OpmSpareRow,
  OpmVerifySatPayload,
  OpmVerifyUnsatPayload,
} from "../opm-actions.models";

export interface OpmSubmitResult {
  ok: boolean;
  error?: string;
}

export interface OpmEquipmentHistory {
  stats: OpmEquipmentHistoryStat[];
  sections: OpmEquipmentHistorySection[];
}

/**
 * OPM Actions' data layer — every method already returns a `Promise` shaped like a
 * real HTTP call, backed today by the static config data in
 * `opm-actions-fields.config.ts`. Swapping in a live backend later only touches this
 * file: replace each body with the matching `AppService`/`CommonApiService` call
 * (see the `// NOTE` on each method) — no component changes required. Parameters
 * that the mock body doesn't need yet (but the real endpoint will) are prefixed
 * `_` — kept in the signature so callers don't change when the real call lands.
 */
@Injectable({ providedIn: "root" })
export class OpmActionsApiService {
  private static readonly LATENCY_MS = 120;

  private static delay<T>(value: T): Promise<T> {
    return new Promise((resolve) => setTimeout(() => resolve(value), OpmActionsApiService.LATENCY_MS));
  }

  loadDartList(): Promise<OpmDartRow[]> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmDartRow[]>('api/v1/op-maintenance/darts/'))
    return OpmActionsApiService.delay([...OPM_DART_ROWS]);
  }

  loadApprovalRows(): Promise<OpmApprovalRow[]> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmApprovalRow[]>('api/v1/op-maintenance/approval-tracking/'))
    return OpmActionsApiService.delay([...RA_STATUS_ROWS]);
  }

  loadRecentActivity(): Promise<OpmActivityRow[]> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmActivityRow[]>('api/v1/op-maintenance/recent-activity/'))
    return OpmActionsApiService.delay([...OP_ACTIVITY]);
  }

  loadUnmappedSpares(): Promise<OpmSpareRow[]> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmSpareRow[]>('api/v1/op-maintenance/unmapped-spares/'))
    return OpmActionsApiService.delay([...UNMAPPED_SPARES]);
  }

  loadEquipmentHistory(_serial: string): Promise<OpmEquipmentHistory> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmEquipmentHistory>(`api/v1/op-maintenance/equipment-history/${_serial}/`))
    return OpmActionsApiService.delay({ stats: EQUIPMENT_HISTORY_STATS, sections: EQUIPMENT_HISTORY_SECTIONS });
  }

  loadGuidance(_equipName: string): Promise<OpmGuidanceItem[]> {
    // NOTE (future): firstValueFrom(this.appService.get<OpmGuidanceItem[]>(`api/v1/op-maintenance/ai-guidance/?equipment=${_equipName}`))
    return OpmActionsApiService.delay([...GUIDANCE]);
  }

  submitDdb(_payload: OpmDdbSubmitPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post('api/v1/op-maintenance/darts/', _payload))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitRaiseRa(_payload: OpmRaiseRaPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post('api/v1/op-maintenance/raise-ra/', _payload))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitGuarantee(_payload: OpmGuaranteeSubmitPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post('api/v1/op-maintenance/guarantee/', _payload))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitSpares(_darts: string[]): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post('api/v1/op-maintenance/spares/map/', { patterns: _darts }))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitTrial(_agency: string): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post('api/v1/op-maintenance/trials/', { agency: _agency }))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitVerifySat(_payload: OpmVerifySatPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post(`api/v1/op-maintenance/approval-tracking/${_payload.requestId}/verify-sat/`, _payload))
    return OpmActionsApiService.delay({ ok: true });
  }

  submitVerifyUnsat(_payload: OpmVerifyUnsatPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.post(`api/v1/op-maintenance/approval-tracking/${_payload.requestId}/verify-unsat/`, _payload))
    return OpmActionsApiService.delay({ ok: true });
  }

  resubmitApproval(_payload: OpmApprovalResubmitPayload): Promise<OpmSubmitResult> {
    // NOTE (future): firstValueFrom(this.appService.patch(`api/v1/op-maintenance/approval-tracking/${_payload.requestId}/`, _payload))
    return OpmActionsApiService.delay({ ok: true });
  }
}
