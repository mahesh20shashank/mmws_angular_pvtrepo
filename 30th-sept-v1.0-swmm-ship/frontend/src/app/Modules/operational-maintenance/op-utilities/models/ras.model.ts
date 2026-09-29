// Types for /api/v1/tank/fuelling/history/, fuelling/save/, ras-monitor/<id>/ —
// backend model tank/models.py:FuellingDetails (fields="__all__" in FuellingDetailsSerializer).
// Every field below is a plain CharField/DecimalField on the model except `tank_category`,
// which is the only real FK (to TankCategory) — the rest have no backend master table.

export interface FuellingDetails {
  id: number;
  /** Free text — this app's convention is 'AT_SEA' | 'AT_HARBOUR', not a DB-enforced choice. */
  fuelling_at: string;
  fuelling_start_date: string | null;
  fuelling_start_time: string | null;
  fuelling_stop_date: string | null;
  fuelling_stop_time: string | null;
  received_at_station: string;
  received_from_ship: string;
  fluid_in_tank: string;
  received_through: string;
  /** TankCategory id — the only FK on this model. */
  tank_category: number | null;
  fuel_received: number | null;
  actual_fuel_received: number | null;
  fuelling_rate: number | null;
  is_fuelling_completed: boolean;
  remarks: string;
  voucher_pdf: string | null;
  created_at: string;
}

export type FuellingDetailsPayload = Partial<Omit<FuellingDetails, 'id' | 'created_at' | 'voucher_pdf'>>;

export interface FuellingHistoryResponse {
  status: string;
  fuelling_history: FuellingDetails[];
}

export interface FuellingSaveResponse {
  status: string;
  message: string;
  data: FuellingDetails;
}

export interface RasMonitorResponse {
  status: string;
  /** A missing id now raises a proper HTTP 404 (with an error envelope) rather than
   *  returning 200 with an empty object — callers should handle the 404 as an error. */
  ras_monitor: FuellingDetails;
}

// ─────────────────────────────────────────────────────────────
// UI-facing row shapes for ras-monitor.ts / ras-history.ts (mapped from FuellingDetails).
// ─────────────────────────────────────────────────────────────

export type FuellingLocation = 'AT_SEA' | 'AT_HARBOUR';

export interface RasMonitorRow {
  id: number;
  ser: number;
  fuellingStart: string;
  fuellingStop: string;
  location: FuellingLocation;
  receivedFromAt: string;
  receivedFuel: number;
  fuellingRateTph: number;
  status: 'Completed' | 'In Progress';
}

export interface RasHistoryRow {
  id: number;
  ser: number;
  fuellingStart: string;
  fuellingStop: string;
  location: FuellingLocation;
  receivedFromAt: string;
  receivedFuel: number;
  fuellingRateTph: number;
}
