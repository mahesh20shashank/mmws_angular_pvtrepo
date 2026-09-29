export interface InventoryTabItem {
  label: string;
  route?: string;
  externalHref?: string;
  children?: InventoryTabItem[];
}
