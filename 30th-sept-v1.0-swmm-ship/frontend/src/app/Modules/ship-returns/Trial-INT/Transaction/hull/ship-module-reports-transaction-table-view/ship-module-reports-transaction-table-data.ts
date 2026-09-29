import { Apiendpoints } from '../../../ApiEndPoints';

export const formatDate = (val: any): string => {
  if (!val) return '-';
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? String(val) : d.toLocaleDateString('en-GB');
  } catch {
    return String(val);
  }
};

export const formatPeriod = (val: any): string => {
  if (!val) return '-';
  return String(val);
};

export const SHIP_REPORT_TRANSACTION_VIEW_CONFIG: any = {
  // SHIP----------------------------------------
  'ship-weight-management-report': {
    baseRoute: 'ship/reports/ship-weight-management',
    title: 'SHIP WEIGHT MANAGEMENT REPORTS',
    description: 'Manage ship weight management reports records',
    apiEndpoint: Apiendpoints.SHIP_WEIGHT_MANAGEMENT,
    addRoute: '',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'created_on',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },
      { field: 'ship_name', headerName: 'Ship Name' },
      {
        headerName: 'Ship Status',
        field: 'ship_status',
        cellRenderer: (params: any) => {
          const ship_status_value = params.value;
          return `<p font-weight: 600;">
            ${ship_status_value?.toUpperCase() || '-'}
          </p>`;
        },
      },
    ],
  },

  // BER CERTIFICATE
  'ber-certificate-report': {
    baseRoute: 'ship/reports/ber-certificate',
    title: 'BER CERTIFICATE',
    description: 'Manage ship BER certificate records',
    apiEndpoint: Apiendpoints.BER_CERTIFICATE,
    addRoute: 'ship/ber-certificate-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || (typeof params.data?.ship === 'string' ? params.data?.ship : '-'),
      },
      {
        headerName: 'Initiated by',
        valueGetter: (params: any) => params.data?.initiated_by_name || params.data?.initiatedBy?.name || params.data?.initiatedBy || params.data?.initiated_by || '-',
      },
      {
        headerName: 'Command',
        valueGetter: (params: any) => params.data?.command?.name || params.data?.ship?.command?.name || params.data?.command || '-',
      },
      {
        headerName: 'Boat type',
        valueGetter: (params: any) => params.data?.type_of_boat || params.data?.typeOfBoat || '-',
      },
      {
        headerName: 'Regst No.',
        valueGetter: (params: any) => params.data?.registration_no || params.data?.boatRegistrationNo || '-',
      },
      {
        headerName: 'BER For',
        valueGetter: (params: any) => params.data?.ber_for || params.data?.berFor || '-',
      },
    ],
  },
  'ber-certificate-view': {
    baseRoute: 'ship/reports/ber-certificate',
    title: 'BER CERTIFICATE',
    description: 'Manage ship BER certificate records',
    apiEndpoint: Apiendpoints.BER_CERTIFICATE,
    addRoute: 'ship/ber-certificate-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || (typeof params.data?.ship === 'string' ? params.data?.ship : '-'),
      },
      {
        headerName: 'Initiated by',
        valueGetter: (params: any) => params.data?.initiated_by_name || params.data?.initiatedBy?.name || params.data?.initiatedBy || params.data?.initiated_by || '-',
      },
      {
        headerName: 'Command',
        valueGetter: (params: any) => params.data?.command?.name || params.data?.ship?.command?.name || params.data?.command || '-',
      },
      {
        headerName: 'Boat type',
        valueGetter: (params: any) => params.data?.type_of_boat || params.data?.typeOfBoat || '-',
      },
      {
        headerName: 'Regst No.',
        valueGetter: (params: any) => params.data?.registration_no || params.data?.boatRegistrationNo || '-',
      },
      {
        headerName: 'BER For',
        valueGetter: (params: any) => params.data?.ber_for || params.data?.berFor || '-',
      },
    ],
  },

  //IN-378 PART 1
  'in-378-part1-report': {
    baseRoute: 'ship/reports/in-378-part1',
    title: 'IN-378 PART 1',
    description: 'Manage IN-378 Part 1 records',
    apiEndpoint: Apiendpoints.IN_378,
    addRoute: 'ship/in-378-part1-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'created_on',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        cellRenderer: (params: any) => {
          return `<p>${params.data?.ship?.name || '-'}</p>`;
        },
      },
      { field: 'initiated_by', headerName: 'Inititated By' },
      { field: 'year', headerName: 'Year' },
      {
        headerName: 'Period',
        valueGetter: (params: any) => formatPeriod(params.data?.period),
      },
    ],
  },

  'in-378-part2-report': {
    baseRoute: 'ship/reports/in-378-part2',
    title: 'IN-378 PART 2',
    description: 'Manage IN-378 Part 2 records',
    apiEndpoint: Apiendpoints.IN_378_PART_II,
    addRoute: 'ship/in-378-part2-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'created_on',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        cellRenderer: (params: any) => {
          return `<p>${params.data?.ship?.name || '-'}</p>`;
        },
      },
      { field: 'initiated_by', headerName: 'Inititated By' },
      { field: 'year', headerName: 'Year' },
      {
        headerName: 'Period',
        valueGetter: (params: any) => formatPeriod(params.data?.period),
      },
    ],
  },
  // IN-305
  'in-305-report': {
    baseRoute: 'ship/reports/in-305',
    title: 'IN-305',
    description: 'Manage IN-305 records',
    apiEndpoint: Apiendpoints.IN_305,
    addRoute: 'ship/in-305-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'created_on',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        cellRenderer: (params: any) => {
          return `<p>${params.data?.ship?.name || '-'}</p>`;
        },
      },
      { field: 'forward_to', headerName: 'Forward to' },
    ],
  },

  'boat-history-sheet-report': {
    baseRoute: 'ship/reports/boat-history-sheet',
    title: 'BOAT HISTORY SHEET',
    description: 'Manage boat history sheet records',
    apiEndpoint: Apiendpoints.BOAT_HISTORY_SHEET,
    addRoute: 'ship/boat-history-sheet-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Ship Name',
        field: 'ship',
        cellRenderer: (params: any) => {
          return `<p>${params.data?.ship?.name || '-'}</p>`;
        },
      },
      {
        headerName: 'Regst No.',
        field: 'bhs_reg_no',
      },
      {
        headerName: 'Year of rendering',
        field: 'bhs_year_of_rendering',
      },
      {
        headerName: 'BER/ABER',
        field: 'bhs_ber_aber',
      },
      {
        headerName: 'Occ of Rendering',
        field: 'bhs_occ_of_rendering',
      },
      {
        headerName: 'Condition of Hull',
        field: 'bhs_cond_of_hull',
      },
      {
        headerName: 'Condition of Fittings',
        field: 'bhs_cond_of_fittings',
      },
    ],
  },

  // QUARTERLY (SACRIFICIAL ANODES)
  'quarterly-hull-potential-with-sacrifical-anodes-report': {
    baseRoute: 'ship/reports/quarterly-hull-potential-with-sacrifical-anodes',
    title:
      'QUARTERLY HULL POTENTIAL DATA OF SHIPS FITTED WITH SACRIFICIAL ANODES',
    description: 'Manage quarterly hull potential data records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES,
    // addRoute: 'ship/quarterly-hull-potential-with-sacrifical-anodes-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      { headerName: 'Ship', field: 'ship_name' },
      { headerName: 'Ship last undocked', field: 'ship_last_undocked' },
      { headerName: 'RE', field: 'reference_electrode' },
      {
        headerName: 'Anti-Corrosive Paint Last Renewed',
        field: 'anti_corrosive_paint_renewed',
      },
    ],
  },

  // QUARTERLY (ICCP)
  //
  'quarterly-hull-potential-with-conventional-iccp-system-report': {
    baseRoute:
      'ship/reports/quarterly-hull-potential-with-conventional-iccp-system',
    title:
      'QUARTERLY HULL POTENTIAL DATA OF SHIPS FITTED WITH CONVENTIONAL ICCP SYSTEM',
    description:
      'Manage quarterly hull potential data of ships fitted with convential ICCP system records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_CONVENTIIONAL_ICCP_SYSTEM,
    addRoute: 'ship/quarterly-hull-potential-with-conventional-iccp-system-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
      { field: 'ship_last_undocked_date', headerName: 'Last Docking Date' },
      { field: 'type_reference_electrode_used', headerName: 'RE Type' },
      { field: 'total_no_of_anodes', headerName: 'Anodes' },
      { field: 'no_of_res', headerName: 'No.of RE' },
    ],
  },
  //

  'quarterly-hull-potential-with-modular-iccp-system-report': {
    baseRoute: 'ship/reports/quarterly-hull-potential-with-modular-iccp-system',
    title:
      'QUARTERLY HULL POTENTIAL RETURNS FOR SHIPS FITTED WITH MODULAR ICCP SYSTEM',
    description:
      'Manage quarterly hull potential data of ships fitted with modular ICCP system records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM,
    addRoute: 'ship/quarterly-hull-potential-with-modular-iccp-system-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
      { field: 'ship_last_undocked_date', headerName: 'Last Docking Date' },
      { field: 'type_reference_electrode_used', headerName: 'RE Type' },
      { field: 'no_of_module', headerName: 'Modules' },
      { field: 'no_of_anodes_per_module', headerName: 'No.of Anodes' },
    ],
  },

  // LOAD TEST CERTIFICATE
  'load-test-certificate-report': {
    baseRoute: 'ship/reports/load-test-certificate',
    title: 'LOAD TEST CERTIFICATE',
    description: 'Manage load test certificate records',
    apiEndpoint: Apiendpoints.LOAD_TEST_CERTIFICATE,
    addRoute: 'ship/load-test-certificate-add',
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'created_on',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },
      { field: 'ship_name', headerName: 'Ship Name' },
      { field: 'patt_no', headerName: 'Patt no.' },
    ],
  },

  //SHIP STAFF HULL INSPECTION REPORT
  'ship-staff-hull-inspection-report-view': {
    baseRoute: 'ship/reports/ship-staff-hull-inspection',
    title: 'SHIP STAFF REPORT OF HULL INSPECTION',
    description: 'Manage ship staff report records',
    apiEndpoint: Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION,
    columns: [
      { field: 'id', headerName: 'Id' },
      {
        headerName: 'Created on',
        field: 'return_date',
        cellRenderer: (params: any) => {
          const dateOnly = formatDate(params.value);
          return `<p font-weight: 600;">${dateOnly}</p>`;
        },
      },

      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
    ],
  },
};

// Aliases so all -view, -report, and -report-report keys work from routes
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-weight-management-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-weight-management-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-378-part1-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-378-part1-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-378-part2-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-378-part2-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-305-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['in-305-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['boat-history-sheet-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['boat-history-sheet-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-sacrifical-anodes-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-sacrifical-anodes-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-conventional-iccp-system-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-conventional-iccp-system-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-modular-iccp-system-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['quarterly-hull-potential-with-modular-iccp-system-report'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['load-test-certificate-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['load-test-certificate-report'];

SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-report'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'];
SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'] = SHIP_REPORT_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'];

