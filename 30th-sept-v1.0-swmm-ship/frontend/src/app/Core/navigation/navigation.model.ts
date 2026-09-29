export type HeaderTabKey =
  | "overview"
  | "configuration"
  | "actions"
  | "reports"
  | "references"
  | "dlGeneration"
  | "insights";

export interface AccessControlled {
  id?: string;
  roles?: string[];
}

export interface NavigationNode extends AccessControlled {
  id: string;
  label: string;
  breadcrumbLabel?: string;
  /** Full-length text for the sidebar item's hover tooltip, when `label` is a
   *  shortened form (e.g. label "KMS", tooltip "Knowledge Management System").
   *  Falls back to `label` when omitted. */
  tooltip?: string;
  icon?: string;
  route?: string;
  /** When true, `route` is the full destination under the module's base route
   *  (e.g. "technical/overview"), rather than a suffix appended after whatever
   *  screen segment is currently in the URL. Used by header-tab dropdown children
   *  that jump between unrelated screens instead of switching sub-views of one screen. */
  absoluteRoute?: boolean;
  /** A plain external/file link (e.g. a downloadable template) instead of an in-app
   *  route — used by header-tab dropdown children only. When set, the header opens
   *  it directly (new tab) instead of routing; `route` is ignored if both are set. */
  externalHref?: string;
  defaultHeaderTab?: HeaderTabKey;
  enabled?: boolean;
  hidden?: boolean;
  showInSidebar?: boolean;
  showInHeader?: boolean;
  permissions?: string[];
  badge?: number;
  children?: NavigationNode[];
}

export interface HeaderTabConfig extends AccessControlled {
  enabled: boolean;
  label?: string;
  disabled?: boolean;
  route?: string;
  /** See `NavigationNode.absoluteRoute` — same meaning, for the tab's own route. */
  absoluteRoute?: boolean;
  children?: NavigationNode[];
  icon?: string;
}

export type HeaderConfig = Record<HeaderTabKey, HeaderTabConfig>;
export type ModuleHeaderConfig = Record<string, HeaderConfig>;
export interface NavigationModule extends AccessControlled {
  id: string;
  title: string;
  section: string;
  baseRoute: string;
  sidebar: NavigationNode;
  header: HeaderConfig;
  headers?: ModuleHeaderConfig;
  /**
   * Which `headers` keys represent a sub-area whose pages are consistently nested under
   * that key (e.g. "routine" → all its pages live under ".../routine/..."), as opposed to
   * a sub-area whose pages sit flat at the module root and merely happen to share a header.
   * Only nested keys get their segment re-prepended when building a tab's target route
   * (see Header.buildTabRoute). Defaults to every `headers` key when omitted.
   */
  headerNestedKeys?: string[];
  /**
   * Per sub-area (matching a `headers` key, e.g. "defect") override for the order tabs
   * render in — defaults to the global `HEADER_TAB_KEYS` order (see `header.ts`) when a
   * sub-area has no entry here. Opt-in only, so modules that don't set this are unaffected.
   */
  headerTabOrders?: Partial<Record<string, HeaderTabKey[]>>;
  headerTabOrder?: HeaderTabKey[];
}

