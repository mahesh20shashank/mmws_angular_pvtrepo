import { inject, Injectable } from "@angular/core";
import { NavigationNode } from "../../../navigation/navigation.model";
import { NavigationService } from "../../../navigation/navigation.service";

export interface SidebarSection {
  sectionLabel: string;
  items: NavigationNode[];
}

@Injectable({
  providedIn: "root",
})
export class SidebarDataService {
  readonly navigation = inject(NavigationService);

  getSidebarSections(): SidebarSection[] {
    const modules = this.navigation.getAccessibleModules();
    const sections = new Map<string, NavigationNode[]>();
    modules.forEach((module) => {
      if (!sections.has(module.section)) {
        sections.set(module.section, []);
      }

      const sidebar: NavigationNode = {
        ...module.sidebar,
        route: module.sidebar.route
          ? this.navigation.buildRoute(module.baseRoute, module.sidebar.route)
          : undefined,
        children: module.sidebar.children?.map((child) => {
          let childPath = "";
          if (child.route) {
            childPath = (!child.id || child.id === child.route || child.route.startsWith(child.id + "/"))
              ? child.route
              : `${child.id}/${child.route}`;
          } else {
            childPath = child.id;
          }
          childPath = childPath.replace(/^\/+/, "");
          return {
            ...child,
            route: this.navigation.buildRoute(module.baseRoute, childPath),
          };
        }),
      };
      sections.get(module.section)!.push(sidebar);
    });
    return Array.from(sections.entries()).map(([sectionLabel, items]) => ({
      sectionLabel,
      items,
    }));
  }
}
