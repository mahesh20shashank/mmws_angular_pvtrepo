import { Injectable, inject } from "@angular/core";
import { DEFAULT_HEADER, NAVIGATION_CONFIG } from "./navigation.config";
import { HEADER_TAB_KEYS } from "./navigation.builders";
import { AccessControlService } from "./access-control.service";
import { Call } from "../http/services/call";
import {
  HeaderConfig,
  HeaderTabConfig,
  HeaderTabKey,
  NavigationModule,
  NavigationNode,
} from "./navigation.model";

@Injectable({
  providedIn: "root",
})
export class NavigationService {
  readonly access = inject(AccessControlService);
  readonly call = inject(Call);

  getDefaultHeader(): HeaderConfig {
    return structuredClone(DEFAULT_HEADER);
  }

  getModules(): NavigationModule[] {
    return structuredClone(NAVIGATION_CONFIG);
  }

  getModule(moduleId: string): NavigationModule | undefined {
    return structuredClone(
      NAVIGATION_CONFIG.find((module) => module.id === moduleId),
    );
  }

  getModuleByBaseRoute(baseRoute: string): NavigationModule | undefined {
    return structuredClone(
      NAVIGATION_CONFIG.find((module) => module.baseRoute === baseRoute),
    );
  }
  getAccessibleModules(): NavigationModule[] {
    return this.getModules()
      .filter((module) => this.access.canAccess(module))
      .map((module) => ({ ...module, sidebar: this.pruneNode(module.sidebar) }))
      .filter(
        (module): module is NavigationModule => module.sidebar !== undefined,
      );
  }

  /**
   * The `headers`/`headerTabOrders` key for the sub-area the URL is currently in (e.g.
   * "defect", "routine"), or undefined if the module has no per-sub-area headers or the
   * URL doesn't resolve to one. Mirrors the child-route lookup in `getAccessibleHeader`.
   */
  getActiveHeaderKey(module: NavigationModule, url?: string): string | undefined {
    if (!url || !module.headers) return undefined;
    const segments = url.split("/").filter(Boolean);
    const afterAuthIndex = segments.indexOf("afterAuth");
    if (afterAuthIndex === -1) return undefined;
    const childRoute = segments[afterAuthIndex + 2];
    return childRoute && module.headers[childRoute] ? childRoute : undefined;
  }

  getAccessibleHeader(module: NavigationModule, url?: string): HeaderConfig {
    let headerConfig = module.header;

    const activeKey = this.getActiveHeaderKey(module, url);
    if (activeKey && module.headers) {
      headerConfig = module.headers[activeKey];
    }

    const result = {} as HeaderConfig;
    if (headerConfig) {
      for (const key of HEADER_TAB_KEYS) {
        const tab = headerConfig[key];
        if (tab) {
          result[key] = {
            ...tab,
            enabled: tab.enabled && this.access.canAccess(tab),
            children: tab.children?.filter((child) => this.access.canAccess(child)),
          };
        }
      }
    }
    return result;
  }

  private pruneNode(node: NavigationNode): NavigationNode | undefined {
    if (!this.access.canAccess(node)) {
      return undefined;
    }
    if (!this.call.isTrialAvailable() && (node.id === "returns" || node.id === "trials")) {
      return undefined;
    }
    if (!node.children?.length) {
      return node;
    }
    const children = node.children
      .map((child) => this.pruneNode(child))
      .filter((child): child is NavigationNode => child !== undefined);
    return { ...node, children };
  }

  getSidebar(moduleId: string): NavigationNode | undefined {
    return this.getModule(moduleId)?.sidebar;
  }

  getHeader(moduleId: string): HeaderConfig | undefined {
    return this.getModule(moduleId)?.header;
  }

  getHeaderTab(
    moduleId: string,
    tab: HeaderTabKey,
  ): HeaderTabConfig | undefined {
    return this.getModule(moduleId)?.header[tab];
  }

  hasChildren(node?: NavigationNode): boolean {
    return !!node?.children?.length;
  }

  isTabEnabled(moduleId: string, tab: HeaderTabKey): boolean {
    return this.getHeaderTab(moduleId, tab)?.enabled ?? false;
  }

  buildRoute(baseRoute: string, path?: string): string {
    if (!path) {
      return `/afterAuth/${baseRoute}`;
    }

    return `/afterAuth/${baseRoute}/${path}`;
  }
  getCurrentModule(url: string): NavigationModule | undefined {
    const cleanUrl = url.split("?")[0];
    const modules = this.getModules();

    // Try matching specific module route or child routes first
    const matchedByRoute = modules.find((module) => {
      if (module.sidebar.route) {
        const fullSidebarRoute = this.buildRoute(module.baseRoute, module.sidebar.route);
        if (cleanUrl === fullSidebarRoute || cleanUrl.startsWith(fullSidebarRoute + "/")) {
          return true;
        }
      }
      if (module.sidebar.children?.length) {
        return module.sidebar.children.some((child) => {
          if (!child.route) return false;
          const fullChildRoute = this.buildRoute(module.baseRoute, child.route);
          return cleanUrl === fullChildRoute || cleanUrl.startsWith(fullChildRoute + "/");
        });
      }
      return false;
    });

    if (matchedByRoute) {
      return matchedByRoute;
    }

    const segments = cleanUrl.split("/").filter(Boolean);
    const afterAuthIndex = segments.indexOf("afterAuth");

    if (afterAuthIndex === -1) {
      return undefined;
    }

    const baseRoute = segments[afterAuthIndex + 1];
    return this.getModuleByBaseRoute(baseRoute);
  }

  getCurrentHeader(url: string): HeaderConfig | undefined {
    return this.getCurrentModule(url)?.header;
  }

  /**
   * Resolve a display label for a path (relative to the module baseRoute) by
   * searching the module's sidebar tree and header tab children. Returns
   * undefined if no configured node matches — callers can then fall back.
   *
   * `url` (the full current URL) picks the right header for modules with
   * per-sub-area `headers` (e.g. op-maintenance's "routine" vs "defect") via
   * `getAccessibleHeader` — the same header the header component itself
   * renders. Omitting it falls back to the module's default `header`, which
   * only produces correct labels for modules without sub-area headers.
   */
  resolveLabel(module: NavigationModule, relativePath: string, url?: string): string | undefined {
    // Match against the sidebar tree (module node + nested children)
    const fromSidebar = this.findNodeByRoute(module.sidebar.children ?? [], relativePath);
    if (fromSidebar) {
      return fromSidebar.breadcrumbLabel ?? fromSidebar.label;
    }

    for (const tab of Object.values(this.getAccessibleHeader(module, url))) {
      // Match against the tab's own route (exact, or a leading path segment of it —
      // e.g. relativePath "technical" against tab.route "technical/overview" — so an
      // intermediate URL segment resolves to the same label as its full route).
      if (tab.route && (tab.route === relativePath || tab.route.startsWith(relativePath + "/"))) {
        return tab.label;
      }

      // Match against header tab children (dropdown items)
      const child = tab.children?.find(
        (c) => c.route === relativePath || relativePath.endsWith("/" + c.route)
      );
      if (child) {
        return child.breadcrumbLabel ?? child.label;
      }
    }

    return undefined;
  }

  private findNodeByRoute(
    nodes: NavigationNode[],
    route: string,
  ): NavigationNode | undefined {
    for (const node of nodes) {
      if (node.route === route || node.id === route) {
        return node;
      }
      if (node.children?.length) {
        const found = this.findNodeByRoute(node.children, route);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  }
}
