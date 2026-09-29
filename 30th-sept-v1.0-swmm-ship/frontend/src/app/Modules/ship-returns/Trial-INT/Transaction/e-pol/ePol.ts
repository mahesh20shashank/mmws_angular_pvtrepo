import { ReusableTableColumn } from '../../ui/reusable-input-table/reusable-input-table.component';

export const basicOilPropertiesColumns: ReusableTableColumn[] = [
  { field: 'sr_no', header: 'SNo.', fieldType: 'ser', align: 'center' },
  { field: 'test', header: 'Type of Test', },
  { field: 'method', header: 'Testing Method', },
  { field: 'unit', header: 'Measurement Unit', },
  { field: 'sample_oil', header: 'Sample Oil', fieldType: 'text' },
  { field: 'fresh_oil', header: 'Fresh Oil', fieldType: 'text' },
  { field: 'range', header: 'Limits', }
];

export const advanceOilPropertiesColumns: ReusableTableColumn[] = [
  { field: 'sr_no', header: 'SNo.', fieldType: 'ser', align: 'center' },
  { field: 'test', header: 'Type of Test', },
  { field: 'method', header: 'Testing Method', },
  { field: 'unit', header: 'Measurement Unit', },
  { field: 'sample_oil', header: 'Sample Oil', fieldType: 'text' },
  { field: 'fresh_oil', header: 'Fresh Oil', fieldType: 'text' },
  
  { field: 'range', header: 'Limits', }
];

export const coolentTestColumns: ReusableTableColumn[] = [
  { field: 'sr_no', header: 'SNo.', fieldType: 'ser', align: 'center' },
  { field: 'test_parameter', header: 'Test Parameter', },
  { field: 'observed_value', header: 'Observed Value', fieldType: 'text' },
  { field: 'limits', header: 'Limits', fieldType: 'text' }
];

export const coolentTest=[
  { sr_no: 1, test_parameter: 'Chloride Content ', observed_value: '', limits: '' },
  { sr_no: 2, test_parameter: 'Hardness ', observed_value: '', limits: '' },
  { sr_no: 3, test_parameter: 'pH Value', observed_value: '', limits: '' },
  { sr_no: 4, test_parameter: ' Inhibitor Additive ', observed_value: '', limits: '' },
]
