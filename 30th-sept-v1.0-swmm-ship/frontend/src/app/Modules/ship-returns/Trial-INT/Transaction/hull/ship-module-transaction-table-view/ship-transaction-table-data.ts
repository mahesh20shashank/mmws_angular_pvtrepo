import { formatDate, formatPeriod } from '../../../ui/master-compat';
import { Apiendpoints } from '../../../ApiEndPoints';

export const SHIP_TRANSACTION_VIEW_CONFIG: any = {
  // SHIP WEIGHT MANAGEMENT
  'ship-weight-management-view': {
    baseRoute: '/ship/returns/ship-weight-management',
    title: 'SHIP WEIGHT MANAGEMENT',
    description: 'Manage ship weight management records',
    apiEndpoint: Apiendpoints.SHIP_WEIGHT_MANAGEMENT,
    addRoute: '/ship/returns/ship-weight-management-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        headerName: 'Ship Status',
        field: 'ship_status',
        valueGetter: (params: any) => (params.data?.ship_status ? String(params.data.ship_status).toUpperCase() : '-'),
      },
    ],

    importExport: {
      import: {
        enabled: true,
        title: 'Import Ship Weight Management Record',
        formName: 'ship_weight_management',
        extraPayload: ['ship_status'],
        workflow: [
          {
            type: 'ship',
            key: 'ship',
            label: 'Select Ship',
          },
          {
            type: 'dropdown',
            key: 'ship_status',
            label: 'Ship Status',
            options: [
              { label: 'Operational', value: 'ops' },
              { label: 'Refit', value: 'refit' },
            ],
          },
          {
            type: 'download',
            dependsOn: 'ship_status',
            files: {
              ops: {
                label: 'Operational Template',
                file: 'assets/legacyDataTemplates/Ship_Weight_Management_OPS_Template.xlsx',
              },
              refit: {
                label: 'Refit Template',
                file: 'assets/legacyDataTemplates/Ship_Weight_Management_REFIT_Template.xlsx',
              },
            },
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.SHIP_WEIGHT_MANAGEMENT,
      },
    },
  },

  // BER CERTIFICATE
  'ber-certificate-report': {
    baseRoute: '/ship/returns/ber-certificate',
    title: 'BER CERTIFICATE',
    description: 'Manage ship BER certificate records',
    apiEndpoint: Apiendpoints.BER_CERTIFICATE,
    addRoute: '/ship/returns/ber-certificate-add',
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
    baseRoute: '/ship/returns/ber-certificate',
    title: 'BER CERTIFICATE',
    description: 'Manage ship BER certificate records',
    apiEndpoint: Apiendpoints.BER_CERTIFICATE,
    addRoute: '/ship/returns/ber-certificate-add',
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

    importExport: {
      import: {
        enabled: true,
        title: 'Import BER certificate Record',
        formName: 'ber_certificate',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/Ber-Certificate_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.BER_CERTIFICATE,
      },
    },
  },

  // IN-378 PART 1
  'in-378-part1-view': {
    baseRoute: '/ship/returns/in-378-part1',
    title: 'IN-378 PART 1',
    description: 'Manage IN-378 Part 1 records',
    apiEndpoint: Apiendpoints.IN_378,
    addRoute: '/ship/returns/in-378-part1-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'initiated_by',
        headerName: 'Initiated By',
        valueGetter: (params: any) => params.data?.initiated_by || '-',
      },
      { field: 'year', headerName: 'Year' },
      {
        headerName: 'Period',
        valueGetter: (params: any) => formatPeriod(params.data?.period),
      },
    ],
    importExport: {
      import: {
        enabled: true,
        title: 'Import In-378 part-I Record',
        formName: 'in378_render_part1',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/IN378_Part1_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.IN_378,
      },
    },
  },

  // IN-378 PART 2
  'in-378-part2-view': {
    baseRoute: '/ship/returns/in-378-part2',
    title: 'IN-378 PART 2',
    description: 'Manage IN-378 Part 2 records',
    apiEndpoint: Apiendpoints.IN_378_PART_II,
    addRoute: '/ship/returns/in-378-part2-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'initiated_by',
        headerName: 'Initiated By',
        valueGetter: (params: any) => params.data?.initiated_by || '-',
      },
      { field: 'year', headerName: 'Year' },
      {
        headerName: 'Period',
        valueGetter: (params: any) => formatPeriod(params.data?.period),
      },
    ],

    importExport: {
      import: {
        enabled: true,
        title: 'Import In-378 part-II Record',
        formName: 'in378_render_part2',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/IN378_Part2_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.IN_378_PART_II,
      },
    },
  },

  // IN-305
  'in-305-view': {
    baseRoute: '/ship/returns/in-305',
    title: 'IN-305',
    description: 'Manage IN-305 records',
    apiEndpoint: Apiendpoints.IN_305,
    addRoute: '/ship/returns/in-305-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        headerName: 'Ship Name',
        field: 'ship',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'forward_to',
        headerName: 'Forward to',
        valueGetter: (params: any) => params.data?.forward_to || '-',
      },
    ],

    importExport: {
      import: {
        enabled: true,
        title: 'Import IN-305 Record',
        formName: 'in305',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/IN305_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.IN_305,
      },
    },
  },

  // BOAT HISTORY SHEET
  'boat-history-sheet-view': {
    baseRoute: '/ship/returns/boat-history-sheet',
    title: 'BOAT HISTORY SHEET',
    description: 'Manage boat history sheet records',
    apiEndpoint: Apiendpoints.BOAT_HISTORY_SHEET,
    addRoute: '/ship/returns/boat-history-sheet-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Ship Name',
        field: 'ship',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        headerName: 'Regst No.',
        field: 'bhs_reg_no',
        valueGetter: (params: any) => params.data?.bhs_reg_no?.registration_no || params.data?.bhs_reg_no || '-',
      },
      {
        headerName: 'Year of rendering',
        field: 'bhs_year_of_rendering',
        valueGetter: (params: any) => params.data?.bhs_year_of_rendering || '-',
      },
      {
        headerName: 'BER/ABER',
        field: 'bhs_ber_aber',
        valueGetter: (params: any) => params.data?.bhs_ber_aber || '-',
      },
      {
        headerName: 'Occ of Rendering',
        field: 'bhs_occ_of_rendering',
        valueGetter: (params: any) => params.data?.bhs_occ_of_rendering || '-',
      },
      {
        headerName: 'Condition of Hull',
        field: 'bhs_cond_of_hull',
        valueGetter: (params: any) => params.data?.bhs_cond_of_hull || '-',
      },
      {
        headerName: 'Condition of Fittings',
        field: 'bhs_cond_of_fittings',
        valueGetter: (params: any) => params.data?.bhs_cond_of_fittings || '-',
      },
    ],
    importExport: {
      import: {
        enabled: true,
        title: 'Import Boat history sheet',
        formName: 'boat_history_sheet',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/Boat_History_Sheet_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.BOAT_HISTORY_SHEET,
      },
    },
  },

  // QUARTERLY (SACRIFICIAL ANODES)
  'quarterly-hull-potential-with-sacrifical-anodes-view': {
    baseRoute: '/ship/returns/quarterly-hull-potential-with-sacrifical-anodes',
    title:
      'QUARTERLY HULL POTENTIAL DATA OF SHIPS FITTED WITH SACRIFICIAL ANODES',
    description: 'Manage quarterly hull potential data records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES,
    addRoute:
      '/ship/returns/quarterly-hull-potential-with-sacrifical-anodes-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Ship',
        field: 'ship_name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        headerName: 'Ship last undocked',
        field: 'ship_last_undocked',
        valueGetter: (params: any) => formatDate(params.data?.ship_last_undocked),
      },
      {
        headerName: 'RE',
        field: 'reference_electrode',
        valueGetter: (params: any) => params.data?.reference_electrode || '-',
      },
      {
        headerName: 'Anti-Corrosive Paint Last Renewed',
        field: 'anti_corrosive_paint_renewed',
        valueGetter: (params: any) => formatDate(params.data?.anti_corrosive_paint_renewed),
      },
    ],

    importExport: {
      import: {
        enabled: true,
        title:
          'Import quarterly hull potential data of ships fitted with sacrificial anodes record',
        formName: 'quarterly_hull_potential_sacrificial_anodes',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/Quarterly_Hull_Potential_Data_of_ships_fitted_with_sacrificial_anodes_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.QUARTERLY_HULL_POTENTIAL_FITTED_WITH_SACRIFICIAL_ANODES,
      },
    },
  },

  // QUARTERLY (CONVENTIONAL ICCP)
  'quarterly-hull-potential-with-conventional-iccp-system-view': {
    baseRoute:
      '/ship/returns/quarterly-hull-potential-with-conventional-iccp-system',
    title:
      'QUARTERLY HULL POTENTIAL DATA OF SHIPS FITTED WITH CONVENTIONAL ICCP SYSTEM',
    description:
      'Manage quarterly hull potential data of ships fitted with conventional ICCP system records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_CONVENTIIONAL_ICCP_SYSTEM,
    addRoute:
      '/ship/returns/quarterly-hull-potential-with-conventional-iccp-system-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
      {
        field: 'ship_last_undocked_date',
        headerName: 'Last Docking Date',
        valueGetter: (params: any) => formatDate(params.data?.ship_last_undocked_date),
      },
      {
        field: 'type_reference_electrode_used',
        headerName: 'RE Type',
        valueGetter: (params: any) => params.data?.type_reference_electrode_used || '-',
      },
      {
        field: 'total_no_of_anodes',
        headerName: 'Anodes',
        valueGetter: (params: any) => params.data?.total_no_of_anodes || '-',
      },
      {
        field: 'no_of_res',
        headerName: 'No.of RE',
        valueGetter: (params: any) => params.data?.no_of_res || '-',
      },
    ],
    importExport: {
      import: {
        enabled: true,
        title:
          'Import quarterly hull potential data of ships fitted with conventional iccp system record',
        formName: 'quarterly_hull_potential_iccp',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/Conventional_ICCP_System_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_CONVENTIIONAL_ICCP_SYSTEM,
      },
    },
  },

  // QUARTERLY (MODULAR ICCP)
  'quarterly-hull-potential-with-modular-iccp-system-view': {
    baseRoute:
      '/ship/returns/quarterly-hull-potential-with-modular-iccp-system',
    title:
      'QUARTERLY HULL POTENTIAL RETURNS FOR SHIPS FITTED WITH MODULAR ICCP SYSTEM',
    description:
      'Manage quarterly hull potential data of ships fitted with modular ICCP system records',
    apiEndpoint:
      Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM,
    addRoute:
      '/ship/returns/quarterly-hull-potential-with-modular-iccp-system-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
      {
        field: 'ship_last_undocked_date',
        headerName: 'Last Docking Date',
        valueGetter: (params: any) => formatDate(params.data?.ship_last_undocked_date),
      },
      {
        field: 'type_reference_electrode_used',
        headerName: 'RE Type',
        valueGetter: (params: any) => params.data?.type_reference_electrode_used || '-',
      },
      {
        field: 'no_of_module',
        headerName: 'Modules',
        valueGetter: (params: any) => params.data?.no_of_module || '-',
      },
      {
        field: 'no_of_anodes_per_module',
        headerName: 'No.of Anodes',
        valueGetter: (params: any) => params.data?.no_of_anodes_per_module || '-',
      },
    ],
    importExport: {
      import: {
        enabled: true,
        title:
          'Import quarterly hull potential data of ships fitted with modular iccp system',
        formName: 'quarterly_hull_potential_modular_iccp',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/Modular_ICCP_System_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.QUARTERLY_HULL_POTENTIAL_DATA_OF_SHIPS_FITTED_WITH_MODULAR_ICCP_SYSTEM,
      },
    },
  },

  // LOAD TEST CERTIFICATE
  'load-test-certificate-view': {
    baseRoute: '/ship/returns/load-test-certificate',
    title: 'LOAD TEST CERTIFICATE',
    description: 'Manage load test certificate records',
    apiEndpoint: Apiendpoints.LOAD_TEST_CERTIFICATE,
    addRoute: '/ship/returns/load-test-certificate-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'created_on',
        valueGetter: (params: any) => formatDate(params.data?.created_on || params.data?.created_at),
      },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'patt_no',
        headerName: 'Patt no.',
        valueGetter: (params: any) => params.data?.patt_no || '-',
      },
    ],

    importExport: {
      import: {
        enabled: true,
        title: 'Import load test certificate record Record',
        formName: 'load_test',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/LoadTestCertificate_Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.LOAD_TEST_CERTIFICATE,
      },
    },
  },

  // SHIP STAFF HULL INSPECTION REPORT
  'ship-staff-hull-inspection-report-view': {
    baseRoute: '/ship/returns/ship-staff-hull-inspection-report',
    title: 'SHIP STAFF REPORT OF HULL INSPECTION',
    description: 'Manage ship staff report records',
    apiEndpoint: Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION,
    addRoute: '/ship/returns/ship-staff-hull-inspection-report-add',
    columns: [
      { field: 'id', headerName: 'Id', width: 90 },
      {
        headerName: 'Created on',
        field: 'return_date',
        valueGetter: (params: any) => formatDate(params.data?.return_date || params.data?.created_on),
      },
      {
        field: 'ship_name',
        headerName: 'Ship Name',
        valueGetter: (params: any) => params.data?.ship?.name || params.data?.ship_name || params.data?.ship || '-',
      },
      {
        field: 'quarter_ending',
        headerName: 'Quarter ending',
        valueGetter: (params: any) => params.data?.quarter_ending || '-',
      },
    ],
    importExport: {
      import: {
        enabled: true,
        title: 'Import Ship staff report of hull inspection Record',
        formName: 'quarterly_hull_inspection',
        workflow: [
          { type: 'ship', key: 'ship', label: 'Select Ship' },
          {
            type: 'download',
            file: 'assets/legacyDataTemplates/ship-staff-hull-survey-Template.xlsx',
          },
          { type: 'upload' },
        ],
      },
      export: {
        enabled: true,
        api: Apiendpoints.SHIP_STAFF_REPORT_ON_HULL_INSPECTION,
      },
    },
  },
};

SHIP_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-report'] = SHIP_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'];
SHIP_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report'] = SHIP_TRANSACTION_VIEW_CONFIG['ship-staff-hull-inspection-report-view'];
