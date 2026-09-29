import { InventoryTabItem } from "../shared/models/inventory-nav.model";

const MO_BASE = "/afterAuth/inventory/shore-inventory-mo";

export const SHORE_INVENTORY_MO_TABS: InventoryTabItem[] = [
  { label: "Dashboard", route: `${MO_BASE}/dashboard` },
  {
    label: "MO Inventory",
    children: [
      { label: "Vendor Search", route: `${MO_BASE}/vendor-search` },
      { label: "Item Search", route: `${MO_BASE}/item-search` },
    ],
  },
  {
    label: "Spares Transaction Cart",
    children: [
      { label: "Survey Cart", route: `${MO_BASE}/transactions/survey` },
      { label: "PTS Approval Cart", route: `${MO_BASE}/transactions/pts` },
      { label: "Demand Cart", route: `${MO_BASE}/transactions/demand` },
      { label: "Receive Cart (Outstanding Demands)", route: `${MO_BASE}/transactions/receive` },
      { label: "IIF Cart", route: `${MO_BASE}/transactions/iif` },
      { label: "PTS / RIO Demands - Survey Pending Cart", route: `${MO_BASE}/transactions/pts-rio-pending` },
    ],
  },
  { label: "Approval", route: `${MO_BASE}/approval` },
  { label: "History", route: `${MO_BASE}/history` },
  {
    label: "References",
    children: [
      {
        label: "As is Transaction",
        children: [
          { label: "Create Cart", route: `${MO_BASE}/references/transactions/create-cart` },
          { label: "Demand Action", route: `${MO_BASE}/references/transactions/demand-action` },
          { label: "Issue Authorise", route: `${MO_BASE}/references/transactions/issue-authorise` },
          { label: "Demand Consolidation", route: `${MO_BASE}/references/transactions/demand-consolidation` },
          { label: "Consumption", route: `${MO_BASE}/references/transactions/consumption` },
          { label: "Survey", route: `${MO_BASE}/references/transactions/survey` },
          { label: "Stock Transfer", route: `${MO_BASE}/references/transactions/stock-transfer` },
          { label: "OBS Master", route: `${MO_BASE}/references/transactions/obs-master` },
        ],
      },
      { label: "Masters", route: `${MO_BASE}/references/masters` },
    ],
  },
];
