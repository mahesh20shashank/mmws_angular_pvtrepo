import { InventoryTabItem } from "../inventory/shared/models/inventory-nav.model";

const CREW_BASE = "/afterAuth/Ship_Crew_and_HR";

/**
 * Mirrors crew_header.html's tab bar exactly: Dashboard | Watch and Station Bill |
 * Crew Utilities ▾ (Leave / TY Duty Details, Leave Forecast). Rendered via the same
 * generic `InventoryTabNav` shell already shared by the Inventory sub-modules.
 */
export const SHIP_CREW_TABS: InventoryTabItem[] = [
  { label: "Dashboard", route: `${CREW_BASE}/dashboard` },
  { label: "Watch and Station Bill", route: `${CREW_BASE}/watch-station-bill` },
  {
    label: "Crew Utilities",
    children: [
      { label: "Leave / TY Duty Details", route: `${CREW_BASE}/leave-ty-duty` },
      { label: "Leave Forecast", route: `${CREW_BASE}/leave-forecast` },
    ],
  },
];
