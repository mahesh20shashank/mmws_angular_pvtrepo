import { ColDef } from "ag-grid-community";
import { TransactionStubActionColumn, TransactionStubConfig } from "./transaction-stub";

const cols = (fields: [string, string, number?][]): ColDef[] =>
  fields.map(([field, headerName, width]) => (width ? { field, headerName, width } : { field, headerName, flex: 1 }));

const addAction = (label = "Add"): TransactionStubActionColumn => ({
  headerName: "Action",
  kind: "text",
  buttons: [{ label, color: "#1d96e9" }],
});

// NOTE: Create Cart, Demand Action, Issue Authorise, Demand Consolidation, and Survey used to be
// configured here too, but each now has its own dedicated page (see `../create-cart/`,
// `../demand-action/`, `../issue-authorise/`, `../demand-consolidation/`, `../survey-reference/`)
// with the popups/drawers/modals their reference templates actually have — this file now only
// covers the 3 pages that already matched their reference (which itself has no popup for them).

export const CONSUMPTION_CONFIG: TransactionStubConfig = {
  title: "Consumption",
  fields: [
    {
      key: "selectOption",
      label: "Select Options",
      kind: "select",
      options: [{ label: "Initiate Consumption", value: "initiate" }],
    },
    { key: "itemCode", label: "Item Code", kind: "text" },
    {
      key: "consumptionType",
      label: "Consumption Type",
      kind: "select",
      options: [{ label: "Staff Consumption", value: "staff" }],
    },
    { key: "consumptionCode", label: "Consumption Code", kind: "text" },
    { key: "mosd", label: "MOSD", kind: "text" },
  ],
  columns: cols([
    ["srNo", "Sr No", 80],
    ["itemCode", "Item Code", 110],
    ["itemDesc", "Item Desc"],
    ["crp", "CRP", 90],
    ["deno", "Deno", 90],
    ["shNo", "SHNo", 90],
    ["intStockSerial", "IntStockSerial", 140],
    ["consumptionCode", "Consumption Code", 150],
    ["moQty", "Mo Qty", 100],
    ["locationMaking", "LocationMaking", 140],
    ["stationCode", "Station Code", 110],
  ]),
  rows: [
    {
      srNo: 1, itemCode: "IT-001", itemDesc: "Laptop Computer", crp: "CR-105", deno: "45000", shNo: "Y",
      intStockSerial: "12", consumptionCode: "Yes", moQty: "Yes", locationMaking: "Kochi", stationCode: "K",
    },
  ],
  actionColumns: [{ headerName: "Action", kind: "icon", buttons: [{ icon: "view", label: "View", color: "#1d96e9" }] }],
};

export const STOCK_TRANSFER_CONFIG: TransactionStubConfig = {
  title: "Stock Transfer",
  fields: [
    {
      key: "authorityType",
      label: "Authority Type",
      kind: "select",
      options: [
        { label: "General Query Stock", value: "general" },
        { label: "StockTransfers Pending For Approval", value: "pending" },
      ],
    },
    { key: "itemCode", label: "Item Code", kind: "text" },
  ],
  columns: cols([
    ["srNo", "Sr No", 80],
    ["shNo", "ShNo", 90],
    ["itemCode", "Item Code", 110],
    ["itemDesc", "Item Desc"],
    ["deno", "Deno", 90],
    ["crp", "CRP", 90],
    ["qty", "Qty", 90],
    ["locationMarking", "LocationMarking", 150],
    ["conditionCode", "ConditionCode", 130],
    ["moQpQty", "MoQpQty", 110],
    ["intStockReciptNo", "IntStockReciptNo", 150],
    ["forCustomerName", "ForCustomerName", 150],
    ["forCustomerCode", "ForCustomerCode", 140],
  ]),
  rows: [
    {
      srNo: 1, shNo: "REP", itemCode: "IT-001", itemDesc: "Laptop Computer", deno: "PC", crp: "CR-105", qty: 10,
      locationMarking: "CR-105", conditionCode: "CR-105", moQpQty: "CR-105", intStockReciptNo: "CR-105",
      forCustomerName: "Y", forCustomerCode: 10,
    },
    {
      srNo: 2, shNo: "ARS", itemCode: "IT-002", itemDesc: "Monitor 24 inch", deno: "Monitor", crp: "CR-205", qty: 5,
      locationMarking: "CR-105", conditionCode: "CR-105", moQpQty: "CR-105", intStockReciptNo: "15000",
      forCustomerName: "Y", forCustomerCode: 5,
    },
  ],
  actionColumns: [addAction()],
};

export const OBS_MASTER_CONFIG: TransactionStubConfig = {
  title: "OBS Master",
  fields: [
    {
      key: "criteria",
      label: "Select Criteria",
      kind: "select",
      options: [{ label: "Initialized Consumption", value: "init" }],
    },
    { key: "itemCode", label: "Item Code", kind: "text" },
    { key: "itemDescription", label: "Item Description", kind: "text" },
  ],
  columns: cols([
    ["srNo", "Sr No", 80],
    ["itemCode", "ItemCode", 120],
    ["itemDesc", "Item Disc"],
    ["crpCategory", "CRP Category", 130],
    ["equipmentCode", "Equipments Code", 140],
    ["equipmentsDisc", "Equipments Disc", 140],
    ["shipAllowance", "Ship Allowance", 130],
    ["stock", "Stock", 100],
    ["quantityFitted", "Quantity Fitted", 130],
    ["actualAllowance", "Actual Allowance", 140],
    ["actualStock", "Actual Stock", 120],
    ["itemRecent", "Item Recent", 120],
    ["addedBy", "Added By", 110],
    ["deptCode", "Dept Code", 110],
    ["subDeptCode", "Sub Dept Code", 130],
    ["stationCode", "Station Code", 120],
    ["dtmApproved", "Dtm Approved", 130],
    ["approvedBy", "Approved By", 120],
    ["demandedQty", "Demanded Qty", 130],
    ["surveyQty", "Survey Qty", 110],
    ["deptStock", "Dept Stock", 110],
  ]),
  rows: [
    {
      srNo: 1, itemCode: "IA-2026-001", itemDesc: "Pressure Gauge", crpCategory: "AUTH-001", equipmentCode: "DEPT001",
      equipmentsDisc: "SUB-DEPT-001", shipAllowance: "LGO-STK-001", stock: 100, quantityFitted: 50, actualAllowance: 50,
      actualStock: 50, itemRecent: 50, addedBy: 50, deptCode: 50, subDeptCode: 50, stationCode: 50, dtmApproved: 50,
      approvedBy: 50, demandedQty: 50, surveyQty: 50, deptStock: 50,
    },
    {
      srNo: 2, itemCode: "IA-2026-002", itemDesc: "Hydraulic Pump", crpCategory: "AUTH-002", equipmentCode: "DEPT002",
      equipmentsDisc: "SUB-DEPT-002", shipAllowance: "LGO-STK-002", stock: 250, quantityFitted: 150, actualAllowance: 50,
      actualStock: 50, itemRecent: 50, addedBy: 50, deptCode: 50, subDeptCode: 50, stationCode: 50, dtmApproved: 50,
      approvedBy: 50, demandedQty: 50, surveyQty: 50, deptStock: 50,
    },
    {
      srNo: 3, itemCode: "IA-2026-003", itemDesc: "Fuel Filter", crpCategory: "AUTH-003", equipmentCode: "DEPT003",
      equipmentsDisc: "SUB-DEPT-003", shipAllowance: "LGO-STK-003", stock: 175.5, quantityFitted: 100, actualAllowance: 50,
      actualStock: 50, itemRecent: 50, addedBy: 50, deptCode: 50, subDeptCode: 50, stationCode: 50, dtmApproved: 50,
      approvedBy: 50, demandedQty: 50, surveyQty: 50, deptStock: 50,
    },
    {
      srNo: 4, itemCode: "IA-2026-004", itemDesc: "Bearing Assembly", crpCategory: "AUTH-004", equipmentCode: "DEPT004",
      equipmentsDisc: "SUB-DEPT-004", shipAllowance: "LGO-STK-004", stock: 300, quantityFitted: 200, actualAllowance: 50,
      actualStock: 50, itemRecent: 50, addedBy: 50, deptCode: 50, subDeptCode: 50, stationCode: 50, dtmApproved: 50,
      approvedBy: 50, demandedQty: 50, surveyQty: 50, deptStock: 50,
    },
  ],
  actionColumns: [{ headerName: "Action", kind: "icon", buttons: [{ icon: "view", label: "View", color: "#1d96e9" }] }],
};
