import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class TrailService {

  // 🔷 EXISTING
  private trialPayload: any = null;

  // 🔷 SUBMENUS
  private subMenus: any[] = [];

  // 🔷 NEW: PRIVILEGES
  private privileges: any[] = [];

  // =========================
  // ✅ TRIAL PAYLOAD
  // =========================

  setTrialPayload(payload: any) {
    this.trialPayload = payload;
    sessionStorage.setItem('trial_payload', JSON.stringify(payload));
  }

  getTrialPayload() {
    if (!this.trialPayload) {
      const stored = sessionStorage.getItem('trial_payload');
      this.trialPayload = stored ? JSON.parse(stored) : null;
    }
    return this.trialPayload;
  }

  // =========================
  // ✅ SUB MENU STORAGE
  // =========================

  setSubMenus(menus: any[]) {
    this.subMenus = menus;
    sessionStorage.setItem('sub_menus', JSON.stringify(menus));
  }

  getSubMenus() {
    if (!this.subMenus || this.subMenus.length === 0) {
      const stored = sessionStorage.getItem('sub_menus');
      this.subMenus = stored ? JSON.parse(stored) : [];
    }
    return this.subMenus;
  }

  // =========================
  // ✅ NEW: PRIVILEGES STORAGE
  // =========================

  setPrivileges(privileges: any[]) {
    this.privileges = privileges;
    sessionStorage.setItem('privileges', JSON.stringify(privileges));
  }

  getPrivileges() {
    if (!this.privileges || this.privileges.length === 0) {
      const stored = sessionStorage.getItem('privileges');
      this.privileges = stored ? JSON.parse(stored) : [];
    }
    return this.privileges;
  }

  // =========================
// ✅ TRANSACTION SUBMENUS
// =========================

private transactionSubMenus: any[] = [];
private transactionPrivileges: any[] = [];

settransactionSubMenus(menus: any[]) {
  this.transactionSubMenus = menus;
  sessionStorage.setItem('transaction_sub_menus', JSON.stringify(menus));
}

gettransactionSubMenus() {
  if (!this.transactionSubMenus || this.transactionSubMenus.length === 0) {
    const stored = sessionStorage.getItem('transaction_sub_menus');
    this.transactionSubMenus = stored ? JSON.parse(stored) : [];
  }
  return this.transactionSubMenus;
}

// =========================
// ✅ TRANSACTION PRIVILEGES
// =========================

settransactionPrivileges(privileges: any[]) {
  this.transactionPrivileges = privileges;
  sessionStorage.setItem('transaction_privileges', JSON.stringify(privileges));
}

gettransactionPrivileges() {
  if (!this.transactionPrivileges || this.transactionPrivileges.length === 0) {
    const stored = sessionStorage.getItem('transaction_privileges');
    this.transactionPrivileges = stored ? JSON.parse(stored) : [];
  }
  return this.transactionPrivileges;
}


// =========================
// ✅ HOME CONFIG
// =========================

private homeConfigSubMenus: any[] = [];
private homeConfigPrivileges: any[] = [];

setHomeConfigSubMenus(menus: any[]) {
  this.homeConfigSubMenus = menus;
  sessionStorage.setItem('home_config_sub_menus', JSON.stringify(menus));
}

getHomeConfigSubMenus() {
  if (!this.homeConfigSubMenus || this.homeConfigSubMenus.length === 0) {
    const stored = sessionStorage.getItem('home_config_sub_menus');
    this.homeConfigSubMenus = stored ? JSON.parse(stored) : [];
  }
  return this.homeConfigSubMenus;
}

setHomeConfigPrivileges(privileges: any[]) {
  this.homeConfigPrivileges = privileges;
  sessionStorage.setItem('home_config_privileges', JSON.stringify(privileges));
}

getHomeConfigPrivileges() {
  if (!this.homeConfigPrivileges || this.homeConfigPrivileges.length === 0) {
    const stored = sessionStorage.getItem('home_config_privileges');
    this.homeConfigPrivileges = stored ? JSON.parse(stored) : [];
  }
  return this.homeConfigPrivileges;
}

  // =========================
  // 🔥 CLEAR ALL
  // =========================



  clearAll() {
    this.trialPayload = null;
    this.subMenus = [];
    this.privileges = [];

    sessionStorage.removeItem('trial_payload');
    sessionStorage.removeItem('sub_menus');
    sessionStorage.removeItem('privileges');
  }

   trialTypeNavigateOptions(
    rawUrl: string,
    trialUuid?: string | number | null,
  ): { path: string[]; queryParams?: { trial: string } } {
    const normalized = this.normalizeTrialTypeRoute(rawUrl);
    if (!normalized) {
      return { path: [] };
    }
    const queryParams =
      trialUuid !== null && trialUuid !== undefined && String(trialUuid) !== ''
        ? { trial: String(trialUuid) }
        : undefined;
    return { path: [normalized], queryParams };
  }
 normalizeTrialTypeRoute(rawUrl: string): string {
    const trimmed = (rawUrl ?? '').toString().trim();
    if (!trimmed) {
      return '';
    }

    const pathOnly = trimmed.split(/[?#]/)[0].replace(/\/+$/, '');
    const segments = pathOnly.replace(/^\/+/, '').split('/').filter(Boolean);

    if (!segments.length) {
      return '';
    }

    // Legacy transaction catalogue grid → SEG catalogue form route
    if (
      segments[0].toLowerCase() === 'transactions' &&
      segments[1]?.toLowerCase() === 'seg-catalogue'
    ) {
      return '/seg/create_catalogue';
    }

    const route = this.segHtmlFormRoute(segments);
    if (route) {
      return route;
    }

    return pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  }

  isSegHtmlForm(formName: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.SEG_HTML_FORM_ROUTES, formName);
  }
  segHtmlFormRoute(segments: string[]): string | null {
    const key =
      segments[0]?.toLowerCase() === 'dynamic-form' && segments[1]
        ? segments[1].toLowerCase()
        : segments.length === 1
          ? segments[0].toLowerCase()
          : '';
    if (!key || !this.SEG_HTML_FORM_ROUTES[key]) {
      return null;
    }
    return this.SEG_HTML_FORM_ROUTES[key];
  }

   SEG_HTML_FORM_ROUTES: Record<string, string> = {
    assistance_form: '/seg/assistance_form',
    hardware_popup_form: '/seg/hardware_popup_form',
    compatible_backup_form: '/seg/compatible_backup_form',
    request_backup_popup: '/seg/request_backup_popup',
    ship_feedback_form: '/seg/ship_feedback_form',
    item_handling_extraction: '/seg/item_handling_extraction',
    item_handling_restoration: '/seg/item_handling_restoration',
    create_catalogue: '/seg/create_catalogue',
    requisition_form: '/transactions/requisition',

    job_assigned_form: '/transactions/job-assigned',
  };


}
