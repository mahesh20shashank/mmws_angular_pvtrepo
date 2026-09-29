import { ReturnedItemStatus } from "./issue.model";

export interface HistoryFilters {
  dateFrom?: string;
  dateTo?: string;
  spareClass?: string;
  equipmentClass?: string;
}

export interface HistoryEntry {
  id: string;
  patternNumber: string;
  description: string;
  date: string;
  quantity: number;
  user: string;
  equipmentClass?: string;
  authority?: string;
  /** Issued-history only: reason of issue (defect/ty-loan remarks). */
  reason?: string;
  /** Issued-history only. */
  equipmentNomenclature?: string;
  /** Returned-history only: return remarks. */
  remarks?: string;
  /** Returned-history only. `Return` has no backend column for this — populated client-side
   * from what the Return modal captured at submission time (see `ObsApiService.returnSpare`),
   * so it is only ever set for returns submitted through this browser after that change. */
  returnedItemStatus?: ReturnedItemStatus;
}
