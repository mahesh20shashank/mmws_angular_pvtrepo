import { environment } from '../../../../environments/environment';

export const API_BASE_URL = environment.apiUrl;
// API_URL
export const Apiendpoints = {
  MASTER_UNIT: 'master/units/',
  MASTER_COMMANDS: 'master/commands/',
  MASTER_COMPARTMENT: 'master/compartments/',
  MASTER_CATEGORY: 'master/category/',
  AUTHORITY: 'master/ops-authority/',
  OVERSEEING_TEAM: '',
  PROPULSION: '',
  BER_CERTIFICATE: 'shipmodule/ber-certificate/',
  SHIP_WEIGHT_MANAGEMENT: 'shipmodule/ship-weight-management/',
  IN_378: 'shipmodule/in378/render-part1/',
  MASTER_REFITS: 'master/refits/',
  BOATS: '',
  BOAT_HISTORY_SHEET: 'shipmodule/boat-history-sheet-details/',
  MASTER_SHIP: 'master/ships/',
  // master/ship-classes/
  MASTER_CLASS: 'master/ship-classes/',
  MASTER_COUNTRY: 'master/countries/',
  MASTER_STATION: 'master/stations/',
  MASTER_STATE: 'master/states/',
  MASTER_CITY: 'master/cities/',
  MASTER_CLUSTER: 'master/clusters/',
  MASTER_LOCATION: 'master/locations/',
  MASTER_MODULE: 'master/modules/',
  MASTER_SUB_MODULE: 'master/submodules/',
  MASTER_BOAT_SPECIFICATION: 'master/boat-specifications/',
  MASTER_BOAT_BUILDER: 'master/boat-builders/',
  MASTER_ENGINE_OEM: 'master/engine-oems/',
  MASTER_BOAT_DETAILS: 'master/boat-details/',
  CONTENT_TYPE: 'master/content-types/dropdown/',
  MASTER_ORDER_BOAT_DETAILS: 'order-boats/',
  MASTER_BOAT_REAPPROPRIATIONS: 'boat-appropriations/',
  MASTER_SYSTEM: 'master/systems/',
  MASTER_EQUIPMENT: 'master/equipments/',
  ICCP_PART_ONE: 'shipmodule/iccp-returns-part-one/iccp-measurements/',
  MASTER_ANODE: 'master/anodes/',
  MASTER_REFERENCE_ELECTRODES: 'master/reference-electrodes/',
  MASTER_DOCKYARD: 'master/dockyards/',
  MASTER_SURVEY_CYCLE: 'master/survey-cycle/',
  MASTER_UNIT_TYPE: 'master/unittypes/',
  // ICCP_PART_ONE: 'shipmodule/iccp-returns-part-one/quarterly-hull-potential/',
  MASTER_ANODES: 'master/anodes/',
  MASTER_BEARING: 'master/lookups/?type__code=BEARING',
  MASTER_OCCASION: 'master/lookups/?type__code=OCC',
  MASTER_REMARK: 'master/lookups/?type__code=RMK',
  MASTER_STATUS: 'master/lookups/?type__code=OPT',
  LOOKUP_PRESENTEDSBY: 'master/lookups/?type__code=PRESENTEDSBY',

  //--------------------------------------- HITU FORMS  ----------------------------------

  HVAC_PHASE1: 'hitumodule/hvac-phase1/',
  WATER_TIGHT_DOOR: 'hitumodule/wt-door/',
  WATER_TIGHT_HATCHES: 'hitumodule/wt-hatches/',
  EMERGENCY_ESCAPE_HATCH: 'hitumodule/escape-hatches/',

  // MASTER
  MASTERS_DROPDOWNS: 'master/lookup-types/',
  MASTERS_DROPDOWN_VALUE: 'master/lookups/',
  MASTER_SATELLITE_UNITS: 'master/satellite-units/',

  // LOGIN AND PERMISSION
  ACCESS_PERMISSIONS: 'access/get-permissions/',

  // TICKETING
  TICKETS: 'ticketing/tickets/',
  TICKETS_SUMMARY: 'ticketing/tickets/summary/',

  // -------------------user--------
  MASTER_USER: 'api/auth/users',

  // ----------------- dashboard analytics ------------
  ETMA_ANALYSIS: 'api/analysis/etma/ingest/',
  DTTT_ANALYSIS: 'api/analysis/dttt/ingest/',
  GTTT_ANALYSIS: 'api/analysis/gttt/ingest/',
  DTTT_TRIAL_DASHBOARD: 'api/data-cap-analysis/trials-dashboard/',
  DTTT_RETURN_DASHBOARD: 'api/data-cap-analysis/returns-by-base-location/',
  MTU_ANALYSIS: 'api/analysis/mtu/ingest/',
  CBIU_ANALYSIS: 'api/analysis/cbiu/ingest/',
  SEG_ANALYSIS_INGEST: 'api/analysis/seg/ingest/',
  SEG_SYSTEM_WISE: 'api/analysis/seg/system-wise/',
  SEG_QUARTER_WISE: 'api/analysis/seg/quarter-wise/',
  CAUSATIVE_ANALYSIS_DASHBOARD: 'api/document/causative-analysis/dashboard/',

  // ----------------- ship dashboard ------------
  SHIP_TRIAL_OVERVIEW_TREND:
    'api/data-cap-analysis/dashboard/ship-trial-overview-trend/',
  USER_TRANSACTIONS_LATEST: 'api/data/user-transactions/latest/',
  DRAFT: 'api/drafts/trials/list/',

  SHIP_DASHBOARD_CARDS: 'api/data-cap-analysis/ship-dashboard/',
  SEG_ANALYTICS_KPI: 'api/data-cap-analysis/seg/kpi/',
  SEG_SHIP_WORKING_STATUS: 'api/data-cap-analysis/seg/ship-working-status/',

  DOCUMENT_UPLOAD: 'shipmodule/record-file-upload/',
  FORM_IMPORTS: 'shipmodule/form-imports/',
  IN_378_PART_I: 'shipmodule/in378/render-part1/',
  IN_378_PART_II: 'shipmodule/in378/render-part2/',
  IN_305: 'shipmodule/in305/',
  QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES:
    'shipmodule/iccp-returns-quarterly-hull-potential/sacrificial-anodes/quarterly-hull-potential/',
  QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_CONVENTIIONAL_ICCP_SYSTEM:
    'shipmodule/iccp-returns-part-one/quarterly-hull-potential/',
  QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM:
    'shipmodule/hull-potential-return-modular-iccp/',
  LOAD_TEST_CERTIFICATE: 'shipmodule/load-test/',
  SHIP_STAFF_REPORT_ON_HULL_INSPECTION: 'shipmodule/quarterly-hull-inspection/',
  SHELL_EXPANSION_GA_DRAWING: 'dashboard/ship-drawing-data/',
  MASTER_STRAKES: 'master/strakes/',
  MASTER_DECKS: 'master/decks/',
  BOAT_MASTER: 'master/boats/',
};
export const equipmentHtml = {
  labelKey: 'name',
  valueKey: 'id',
  htmlTag: `
  <div>
    <div class="font-bold text-[15px] leading-[1.05] text-white">
      {{item.nomenclature}}
    </div>
    <div class="mt-[2px] text-[12px] text-white/60">
      Equipment Name: {{item.name || '-'}}<span *ngIf="item.name">,</span>
      Model: {{item.model || '-'}}<span *ngIf="item.model">,</span>
      Serial Number: {{item.serial_no || '-'}}
    </div>
  </div>
`,
};

export const userDropdownOptions = {
  labelKey: 'label',
  valueKey: 'id',
  htmlTag: `
  <div>
    <div class="font-bold text-[15px] leading-[1.05] text-white">
    {{item.loginname || '-'}} | {{item.hrcdf_desig || '-'}}

    </div>
    <div class="text-[12px] mt-[2px] text-white/60">
    <span *ngIf="item.rankName">({{item.rankName}})</span>
      {{item.first_name}} {{item.last_name}} |
      <span *ngIf="item.email">Email: {{item.email || '-'}}</span><span *ngIf="item.email"> | </span>
      <span *ngIf="item.department_name">Dept: {{item.department_name || '-'}}</span><span *ngIf="item.department_name"> | </span>
      <span *ngIf="item.unit_name">Unit: {{item.unit_name || '-'}}</span>
    </div>
  </div>
`,
};
