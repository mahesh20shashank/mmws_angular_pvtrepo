import { ColDef } from "ag-grid-community";

export const SURVEY_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Name", flex: 1.4 },
  { field: "qty", headerName: "Survey Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature", flex: 1 },
  { field: "dartNo", headerName: "Dart No", width: 120 },
];

export const PTS_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Name", flex: 1.4 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "dartNo", headerName: "DART No", width: 120 },
  { field: "demandNo", headerName: "WLMS Demand No.", width: 150 },
];

export const DEMAND_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "itemDescription", headerName: "Item Name", flex: 1.2 },
  { field: "surveyNo", headerName: "Survey No", width: 120 },
  { field: "demandNo", headerName: "WED Demand No.", width: 150 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "dartNo", headerName: "DART No", width: 120 },
];

export const RECEIVE_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "issueStatus", headerName: "WED Item Issue Status", width: 170 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "demandType", headerName: "Demand Type", width: 130 },
  { field: "surveyNo", headerName: "Survey Number", width: 130 },
  { field: "qty", headerName: "Demand Qty", width: 110 },
  { field: "wedIssueQty", headerName: "WED Issue Qty", width: 130 },
  { field: "receivedQty", headerName: "Received Qty", width: 130 },
  { field: "category", headerName: "Category (P/R/C)", width: 150 },
  { field: "dartNo", headerName: "DART No", width: 120 },
  { field: "vettingRemarks", headerName: "WED Vetting Remarks", flex: 1 },
  { field: "demandNo", headerName: "Demand No", width: 120 },
];

export const IIF_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "swmmPatternNo", headerName: "SWMM Pattern No", flex: 1 },
  { field: "incattingStatus", headerName: "INcatting Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "equipmentClass", headerName: "Equipment Class", flex: 1 },
  { field: "category", headerName: "Category", width: 110 },
];

export const PTS_RIO_PENDING_CART_COLUMNS: ColDef[] = [
  { field: "syncStatus", headerName: "WLMS Sync Status", width: 140 },
  { field: "itemCode", headerName: "WED Item Code", flex: 1 },
  { field: "hodApprovalStatus", headerName: "HOD Approval Status", width: 160 },
  { field: "demandType", headerName: "Demand Type", width: 120 },
  { field: "itemDescription", headerName: "Item Description", flex: 1.2 },
  { field: "denomination", headerName: "Denomination", width: 130 },
  { field: "qty", headerName: "Survey Qty", width: 110 },
  { field: "category", headerName: "Category", width: 110 },
  { field: "equipmentNomenclature", headerName: "Equipment Nomenclature", flex: 1 },
  { field: "dartNo", headerName: "DART No", width: 120 },
  { field: "demandNo", headerName: "Demand No", width: 120 },
  { field: "receiptStatus", headerName: "Receipt Status", width: 130 },
];
