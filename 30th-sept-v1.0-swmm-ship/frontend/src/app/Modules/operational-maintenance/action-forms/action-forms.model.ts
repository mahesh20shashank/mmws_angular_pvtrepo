export interface SpareItem {
  pk?: string | number;
  item_code?: string;
  item_desc?: string;
  qtyRequired?: number;
  inventoryType?: string;
  crp_category?: string;
  sourceTab?: string;
  partNumber?: string;
  /** The value to STORE in `dart.DartSpare.inventory_type` for this row, which is not always
   * the `inventoryType` the grid displays.
   *
   * A spare seeded into this form from Due for Survey or Due for Demand still shows
   * `Inventory Type: OBS` to the operator, because that is what it is - but it must be STORED
   * with the `OBS_INTERNAL` origin sentinel, so the storekeeper's
   * `Maintainer Spare Request - Defect DART` list can leave out spares the ship already issued
   * and already consumed. Keeping the stored value on its own key is what lets the display
   * stay exactly as it is.
   *
   * Absent on every row `SpareSelectionModal` produces, and `DefactForm.submit` falls back to
   * `"OBS"` when it is - so a maintainer's own DART is unaffected. */
  dartInventoryType?: string;
  [key: string]: unknown;
}

export interface ConfirmModalData {
  dartForMaintenance?: string;
  dartOccasion?: string;
  startDate?: string;
  endDate?: string;
  existingRefit?: string;
  [key: string]: unknown;
}

export interface MasterEquipmentItem {
  id?: string | number;
  equipment_name?: string;
  equipment_code?: string;
  [key: string]: unknown;
}

export interface SelectOption {
  label: string;
  value: string | number;
}
