import { InventoryTabItem } from "../shared/models/inventory-nav.model";

const WED_BASE = "/afterAuth/inventory/shore-inventory-wed";

export const SHORE_INVENTORY_WED_TABS: InventoryTabItem[] = [
  { label: "Dashboard", route: `${WED_BASE}/dashboard` },
  {
    label: "WED Inventory",
    children: [{ label: "Item Search", route: `${WED_BASE}/item-search` }],
  },
  {
    label: "Spares Transaction Cart",
    children: [
      { label: "Survey Cart", route: `${WED_BASE}/transactions/survey` },
      { label: "PTS Approval Cart", route: `${WED_BASE}/transactions/pts` },
      { label: "Demand Cart", route: `${WED_BASE}/transactions/demand` },
      { label: "Receive Cart (Outstanding Demands)", route: `${WED_BASE}/transactions/receive` },
      { label: "IIF Cart", route: `${WED_BASE}/transactions/iif` },
      { label: "PTS/ RIO Demand - Survey Pending Cart", route: `${WED_BASE}/transactions/pts-rio-pending` },
    ],
  },
  { label: "Signal Demand", route: `${WED_BASE}/signal-demand` },
  { label: "Approval", route: `${WED_BASE}/approval` },
  { label: "History", route: `${WED_BASE}/history` },
  {
    label: "References",
    children: [{ label: "Masters", route: `${WED_BASE}/references/masters` }],
  },
];
