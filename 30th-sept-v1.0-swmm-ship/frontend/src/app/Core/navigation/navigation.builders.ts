import {
  HeaderConfig,
  HeaderTabConfig,
  HeaderTabKey,
  ModuleHeaderConfig,
  NavigationModule,
  NavigationNode,
} from "./navigation.model";

export const HEADER_TAB_KEYS: readonly HeaderTabKey[] = [
  "overview",
  "actions",
  "reports",
  "dlGeneration",
  "insights",
  "references",
  "configuration",
];

export const HEADER_TAB_LABELS: Record<HeaderTabKey, string> = {
  overview: "Overview",
  configuration: "Configuration",
  actions: "Actions",
  reports: "Reports",
  dlGeneration: "DL I Generation",
  insights: "Insights",
  references: "References",
};

/** Keys that stay hidden unless a module explicitly opts in (`enabled: true` in its
 *  override) — added later than the original 5, so defaulting them to visible would
 *  silently add an extra tab to every module's header, including ones that never asked
 *  for it. `dlGeneration` belongs only to Op. Maintenance's Routines sub-header
 *  (`createRoutineHeader`); every other module either doesn't mention it (now correctly
 *  hidden) or explicitly disabled it as a defensive no-op that's now redundant but
 *  harmless. */
const OPT_IN_TAB_KEYS: ReadonlySet<HeaderTabKey> = new Set(["references", "dlGeneration"]);

export interface HeaderTabOverride {
  enabled?: boolean;
  disabled?: boolean;
  label?: string;
  route?: string | null;
  /** See `NavigationNode.absoluteRoute`. */
  absoluteRoute?: boolean;
  children?: NavigationNode[];
  roles?: string[];
  /** See `HeaderTabConfig.activeMatch`. */
  activeMatch?: string[];
}

function createHeaderTab(key: HeaderTabKey, override: HeaderTabOverride = {}): HeaderTabConfig {
  const defaultEnabled = !OPT_IN_TAB_KEYS.has(key);
  const tab: HeaderTabConfig = {
    enabled: override.enabled ?? defaultEnabled,
    disabled: override.disabled ?? false,
    label: override.label ?? HEADER_TAB_LABELS[key],
  };

  const route = "route" in override ? override.route : key;
  if (route != null) {
    tab.route = route;
  }

  if (override.absoluteRoute) {
    tab.absoluteRoute = true;
  }

  if (override.children) {
    tab.children = override.children;
  }

  if (override.roles) {
    tab.roles = override.roles;
  }

  if (override.activeMatch) {
    (tab as HeaderTabConfig & { activeMatch?: string[] }).activeMatch = override.activeMatch;
  }

  return tab;
}

export function createHeader(
  overrides: Partial<Record<HeaderTabKey, HeaderTabOverride>> = {},
): HeaderConfig {
  return HEADER_TAB_KEYS.reduce((header, key) => {
    header[key] = createHeaderTab(key, overrides[key]);
    return header;
  }, {} as HeaderConfig);
}

export interface SidebarItemSpec {
  id: string;
  label: string;
  /** See `NavigationNode.tooltip`. */
  tooltip?: string;
  route?: string;
  /** See `NavigationNode.absoluteRoute`. */
  absoluteRoute?: boolean;
  /** See `NavigationNode.externalHref`. */
  externalHref?: string;
  icon?: string;
  children?: NavigationNode[];
  roles?: string[];
}

export function createSidebarItem(spec: SidebarItemSpec): NavigationNode {
  const node: NavigationNode = { id: spec.id, label: spec.label };
  if (spec.tooltip !== undefined) node.tooltip = spec.tooltip;
  if (spec.route !== undefined) node.route = spec.route;
  if (spec.absoluteRoute) node.absoluteRoute = true;
  if (spec.externalHref !== undefined) node.externalHref = spec.externalHref;
  if (spec.icon !== undefined) node.icon = spec.icon;
  if (spec.children !== undefined) node.children = spec.children;
  if (spec.roles !== undefined) node.roles = spec.roles;
  return node;
}

export function createSidebar(spec: SidebarItemSpec): NavigationNode {
  return createSidebarItem(spec);
}

/** Build a sidebar node that always has children (readability helper). */
export function createSidebarWithChildren(
  spec: Omit<SidebarItemSpec, "children"> & { children: NavigationNode[] },
): NavigationNode {
  return createSidebarItem(spec);
}



export interface ModuleSpec {
  id: string;
  title: string;
  section: string;
  baseRoute: string;
  sidebar: NavigationNode;
  header?: HeaderConfig;
  headers?: ModuleHeaderConfig;
  headerNestedKeys?: string[];
  headerTabOrders?: Partial<Record<string, HeaderTabKey[]>>;
  headerTabOrder?: HeaderTabKey[];
  roles?: string[];
}

export function createModule(spec: ModuleSpec): NavigationModule {
  const module: NavigationModule = {
    id: spec.id,
    title: spec.title,
    section: spec.section,
    baseRoute: spec.baseRoute,
    sidebar: spec.sidebar,
    header: spec.header ?? createHeader(),
  };
  if (spec.headers !== undefined) {
    module.headers = spec.headers;
  }
  if (spec.roles !== undefined) {
    module.roles = spec.roles;
  }
  if (spec.headerNestedKeys !== undefined) {
    module.headerNestedKeys = spec.headerNestedKeys;
  }
  if (spec.headerTabOrders !== undefined) {
    module.headerTabOrders = spec.headerTabOrders;
  }
  if (spec.headerTabOrder !== undefined) {
    module.headerTabOrder = spec.headerTabOrder;
  }
  return module;
}
