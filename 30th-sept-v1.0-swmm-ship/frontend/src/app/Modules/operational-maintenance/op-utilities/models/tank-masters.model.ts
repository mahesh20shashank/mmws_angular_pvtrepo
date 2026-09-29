// Types for the Tank Masters CRUD resources under /api/v1/tank/crud/ —
// backend: tank/models.py + tank/serializers.py (all ModelSerializers, fields="__all__").
// Every create/update goes through BaseReadWriteViewSet (tank/views.py), whose envelope
// differs by action: list -> {status,data:[...]}, create/update -> {status,...fields}
// (flat, no `data` wrapper), delete -> {status,message}, retrieve -> raw fields (no envelope).

export interface FluidTypeApi {
  id: number;
  fluid_type: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface FluidApi {
  id: number;
  fluid: string;
  /** FluidType id. */
  fluid_type: number;
  measuring_unit: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface TankCategoryApi {
  id: number;
  tank_category: string;
  manual_name: string;
  /** Fluid id (nullable). */
  fluid: number | null;
  graph_no: number | null;
  created_at: string;
  updated_at: string;
}

export interface TankLocationApi {
  id: number;
  location_name: string;
  created_at: string;
  updated_at: string;
  created_by: number | null;
}

export interface TankTypeDetailApi {
  id: number;
  /** TankCategory id. */
  tank: number;
  /** Nomenclature, e.g. "Avcat Tank #1". */
  tank_type: string;
  /** FluidType id (nullable). */
  fluid_type: number | null;
  /** TankLocation id (nullable). */
  location: number | null;
  /** TankFluidUnit id (nullable). */
  unit: number | null;
  tank_subtype: 'storage' | 'service';
  capacity: string | null;
  updated_at: string;
  /** Read-only: tank.manual_name. */
  tank_name: string;
  /** Read-only: unit.fluid_unit. */
  unit_name: string | null;
}

export interface TankSoundingMasterApi {
  id: number;
  /** TankTypeDetail id. */
  tank_category_detail: number;
  mm_level: number;
  volume: number;
  percentage_flag: 95 | 100;
  created_at: string;
  updated_at: string;
}

export interface CategoryDropdownRow {
  id: number;
  tank_category: string;
  tank_name: string;
  manual_name: string;
  count: number;
  fluid_id: number | null;
  fluid: string | null;
  fluid_type_id: number | null;
  fluid_type: string | null;
  measuring_unit: string | null;
}

export interface CategoryDropdownResponse {
  status: string;
  tank_types: CategoryDropdownRow[];
}

export interface CrudListResponse<T> {
  status: string;
  data: T[];
}

export type CrudWriteResponse<T> = T & { status: string };

export interface CrudDeleteResponse {
  status: string;
  message: string;
}

// ─────────────────────────────────────────────────────────────
// UI-facing types for tank-masters.ts (mapped from the Api types above).
// ─────────────────────────────────────────────────────────────

export type MasterTab = 'pol-types' | 'pol-names' | 'tank-category' | 'tank-location' | 'tank-details';

export interface PolTypeRow {
  id: number;
  ser: number;
  polType: string;
}

export interface PolNameRow {
  id: number;
  ser: number;
  polName: string;
  polType: string;
  unit: string;
}

export interface TankCategoryRow {
  id: number;
  ser: number;
  categoryName: string;
  manualName: string;
  pol: string;
}

export interface TankLocationRow {
  id: number;
  ser: number;
  locationName: string;
}

export interface TankDetailRow {
  /** Real TankTypeDetail id, or a negative temp id for a pending (unsaved) row. */
  id: number;
  ser: number;
  categoryName: string;
  nomenclature: string;
  subtype: 'storage' | 'service';
  locationName: string;
  cap95: number | null;
  cap100: number | null;
  isPending: boolean;
}

/** A row generated locally by "+ Add Tanks", before it's persisted. */
export interface PendingTankRow {
  tempId: number;
  tankCategoryId: number;
  categoryName: string;
  nomenclature: string;
  subtype: 'storage' | 'service';
}
