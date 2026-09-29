import { ColDef } from "ag-grid-community";

export const SURVEY_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "MO Item Code", flex: 1 },
  { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.4 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "qty", headerName: "Survey Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature", flex: 1 },
  { field: "dartNo", headerName: "DART No", width: 120 },
];

export const PTS_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "MO Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Name", flex: 1.4 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "dartNo", headerName: "Dart No", width: 120 },
];

export const DEMAND_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "MO Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Name", flex: 1.2 },
  { field: "ilmsDemandNo", headerName: "ILMS Demand No.", width: 150 },
  { field: "surveyNo", headerName: "Survey No.", width: 120 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "dartNo", headerName: "DART No", width: 120 },
  { field: "moVettingRemarks", headerName: "MO Vetting Remarks", flex: 1 },
];

export const RECEIVE_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "MO Item Code", flex: 1 },
  { field: "moIssueStatus", headerName: "MO Item Issue Status", width: 170 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "demandNo", headerName: "Demand No", width: 120 },
  { field: "demandType", headerName: "Demand Type", width: 130 },
  { field: "surveyNo", headerName: "Survey No.", width: 120 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  // BACKEND GAP: `qty_issued_by_mo` is hardcoded to "—" server-side (`ilms/views.py`
  // `_receive_row()`) — no model field tracks it yet, so this column is always blank for now.
  { field: "moIssueQty", headerName: "MO Issue Qty", width: 120 },
  { field: "category", headerName: "CRP Category", width: 130 },
  { field: "dartNo", headerName: "DART No", width: 120 },
];

export const IIF_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "SWMM Pattern No", flex: 1 },
  { field: "incattingStatus", headerName: "INcatting Status", width: 140 },
  { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  { field: "category", headerName: "Category", width: 110 },
];

export const PTS_RIO_PENDING_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "ILMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "MO Item Code", flex: 1 },
  { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
  { field: "demandType", headerName: "Demand Type", width: 130 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "qty", headerName: "Survey Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature", flex: 1 },
  { field: "dartNo", headerName: "DART No", width: 120 },
  { field: "demandNo", headerName: "Demand No.", width: 130 },
];
