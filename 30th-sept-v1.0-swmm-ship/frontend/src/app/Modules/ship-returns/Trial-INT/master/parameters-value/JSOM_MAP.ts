


export const DA_LOAD = {
    columns: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT", "UNIT", "OBSERVED VALUE @ 25% LOAD", "OBSERVED VALUE @ 50% LOAD", "OBSERVED VALUE @ 75% LOAD", "OBSERVED VALUE @ 100% LOAD", "OBSERVED VALUE D @ 100% LOAD", "REMARKS"],
    colConfig: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT"],
  fristTable: {
    id: 'sectionone_table_0',
    sectionType: 'matrixTable',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_2_boilerArcPortShip",
            "key": "boilerArcPortShip",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.ship_name",
            "prefill": true,
            "prefillSource": "context.ship_name"
              
          },
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "engine_make",
            "type": "label",
            "value": "ENGINE MAKE",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_2_boilerArcPortENGINEMAKE",
            "key": "boilerArcPortENGINEMAKE",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
                
          },
          {
            "_id": "sectionone_table_0_row_2_cell_3_static",
            "key": "date_of_trial",
            "type": "label",
            "value": "DATE OF TRIAL :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_4_boilerArcPortDATETRIAL",
            "key": "boilerArcPortDATETRIAL",
            "type": "date",
            "value": "",
            "rows": null
                
          }
        ]
      },
      {
        "_id": "sectionone_table_0_row_3",
        "cells": [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "type": "label",
            "value": "Model",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_boilerArcPortMODEL",
            "key": "boilerArcPortMODEL",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 5,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
         
      {
        "_id": "sectionone_table_0_row_5",
        "cells": [
          {
            "_id": "sectionone_table_0_row_5_cell_1_static",
            "key": "occasion_type_of_trials",
            "type": "label",
            "value": "OCCASION & TYPE OF TRIALS :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_2_boilerArcPortOCCASIONTYPETRIALS",
            "key": "boilerArcPortOCCASIONTYPETRIALS",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 5,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "sectionone_table_0_row_6",
        "cells": [
          {
            "_id": "sectionone_table_0_row_6_cell_1_static",
            "key": "running_hour_post_major_overhaul",
            "type": "label",
            "value": "RUNNING HOUR POST MAJOR OVERHAUL:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_6_cell_2_boilerArcPortRUNPOSTMAJOR",
            "key": "boilerArcPortRUNPOSTMAJOR",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 5,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "sectionone_table_0_row_7",
        "cells": [
          {
            "_id": "sectionone_table_0_row_7_cell_1_static",
            "key": "running_hour_since_installation",
            "type": "label",
            "value": "RUNNING HOUR SINCE INSTALLATION :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_2_boilerArcPortRUNINSTALLATION",
            "key": "boilerArcPortRUNINSTALLATION",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 5,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
};

export const DA_RH_EXT = {
  columns: [
    "Sr No",
    "PARAMETER",
    "LOCATION",
    "LOWER- UPPER LIMIT",
    "UNIT",
    "OBSERVED VALUE @ 25% LOAD",
    "OBSERVED VALUE @ 50% LOAD",
    "OBSERVED VALUE @ 75% LOAD",
    "OBSERVED VALUE @ 100% LOAD",
    "OBSERVED VALUE D @ 100% LOAD",
    "REMARKS"
  ],
  colConfig: [
    "Sr No",
    "PARAMETER",
    "LOCATION",
    "LOWER- UPPER LIMIT"
  ],
  fristTable: {
    id: 'sectionone_table_0',
    sectionType: 'matrixTable',
    title: '<h2>PROFORMA FOR LIFE EXTENSION TRIALS OF DIESEL ENGINES</h2>',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_2_Ship",
            "key": "Ship",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_2',
        cells: [
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "name_of_equipment",
            "type": "label",
            "value": "Name of Equipment",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_3',
        cells: [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "key": "engine_type_make_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_static",
            "key": "engine_type_make_label",
            "type": "label",
            "value": "Engine Type and Make",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_3_Engine_Type_Make",
            "key": "Engine_Type_Make",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_4',
        cells: [
          {
            "_id": "sectionone_table_0_row_4_cell_1_static",
            "key": "rated_maximum_rpm_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_2_static",
            "key": "rated_maximum_rpm_label",
            "type": "label",
            "value": "Rated Maximum RPM",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_3_Rated_Maximum_RPM",
            "key": "Rated_Maximum_RPM",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_5',
        cells: [
          {
            "_id": "sectionone_table_0_row_5_cell_1_static",
            "key": "equipment_serial_no_serial",
            "type": "label",
            "value": "(C)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_2_static",
            "key": "equipment_serial_no_label",
            "type": "label",
            "value": "Equipment Serial No",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_3_Equipment_Serial_No",
            "key": "Equipment_Serial_No",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_6',
        cells: [
          {
            "_id": "sectionone_table_0_row_6_cell_1_static",
            "key": "running_hours",
            "type": "label",
            "value": "Running Hours",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_7',
        cells: [
          {
            "_id": "sectionone_table_0_row_7_cell_1_static",
            "key": "since_installation_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_2_static",
            "key": "since_installation_label",
            "type": "label",
            "value": "Since Installation",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_3_Since_Installation",
            "key": "Since_Installation",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_8',
        cells: [
          {
            "_id": "sectionone_table_0_row_8_cell_1_static",
            "key": "since_last_major_routine_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_8_cell_2_static",
            "key": "since_last_major_routine_label",
            "type": "label",
            "value": "Since Last Major Routine",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_8_cell_3_Since_Last_Major_Routine",
            "key": "Since_Last_Major_Routine",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_9',
        cells: [
          {
            "_id": "sectionone_table_0_row_9_cell_1_static",
            "key": "last_major_routine_undertaken",
            "type": "label",
            "value": "Last Major Routine Undertaken",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_9_cell_2_Last_Major_Routine_Undertaken",
            "key": "Last_Major_Routine_Undertaken",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_10',
        cells: [
          {
            "_id": "sectionone_table_0_row_10_cell_1_static",
            "key": "past_history_equipment",
            "type": "label",
            "value": "Past History of Equipment (Indicate major defects observed/ Assemblies replaced during the operation period)",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_10_cell_2_Past_History_Equipment",
            "key": "Past_History_Equipment",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_11',
        cells: [
          {
            "_id": "sectionone_table_0_row_11_cell_1_static",
            "key": "state_of_safety_devices",
            "type": "label",
            "value": "State of Safety Devices (Date last checked and present Ops status.) Attach SDC report.",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_11_cell_2_State_of_Safety_Devices",
            "key": "State_of_Safety_Devices",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_12',
        cells: [
          {
            "_id": "sectionone_table_0_row_12_cell_1_static",
            "key": "details_ss_routines_completed",
            "type": "label",
            "value": "Details of SS Routines completed",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_12_cell_2_Details_SS_Routines_completed",
            "key": "Details_SS_Routines_completed",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_13',
        cells: [
          {
            "_id": "sectionone_table_0_row_13_cell_1_static",
            "key": "tentative_dates_for",
            "type": "label",
            "value": "Tentative dates for",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_14',
        cells: [
          {
            "_id": "sectionone_table_0_row_14_cell_1_static",
            "key": "installation_instrumentation_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_14_cell_2_static",
            "key": "installation_instrumentation_label",
            "type": "label",
            "value": "Installation, Instrumentation and safety devices checks",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_14_cell_3_Installation_Instrumentation",
            "key": "Installation_Instrumentation",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_15',
        cells: [
          {
            "_id": "sectionone_table_0_row_15_cell_1_static",
            "key": "load_trials_sea_trials_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_15_cell_2_static",
            "key": "load_trials_sea_trials_label",
            "type": "label",
            "value": "Load Trials/ Sea Trials",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_15_cell_3_Load_Trials_Sea_Trials",
            "key": "Load_Trials_Sea_Trials",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_16',
        cells: [
          {
            "_id": "sectionone_table_0_row_16_cell_1_static",
            "key": "hours_proposed_extension",
            "type": "label",
            "value": "Hours proposed for extension",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_16_cell_2_Hours_proposed_extension",
            "key": "Hours_proposed_extension",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_17',
        cells: [
          {
            "_id": "sectionone_table_0_row_17_cell_1_static",
            "key": "attach_parameter_sheet",
            "type": "label",
            "value": "Attach Parameter sheet corresponding to the max. load/ ERPM achieved in the last one month",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_17_cell_2_Attach_Parameter_sheet",
            "key": "Attach_Parameter_sheet",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
  
};


export const DA_SAFETY = {
  columns: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT", "OBSERVED VALUE", "REMARKS(SAT/UNSAT)"],
  colConfig: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT"],
  fristTable: {
  id: 'sectionone_table_0',
  sectionType: 'matrixTable',
  title: ' <h2>DIESEL ENGINE SAFETY CHECKS</h2>',
  rows: [
    {
      _id: 'sectionone_table_0_row_1',
      cells: [
        {
          "_id": "sectionone_table_0_row_1_cell_1_static",
          "key": "ship",
          "type": "label",
          "value": "SHIP :",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_1_cell_2_Dasafe_Ship",
          "key": "Dasafe_Ship",
          "type": "input",
          "value": "",
          "rows": null,
          "disabled": true,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left",
          "isDynamic": true,
          "lookupKey": "context.ship_name",
          "prefill": true,
          "prefillSource": "context.ship_name"
        },
        {
          "_id": "sectionone_table_0_row_1_cell_3_static",
          "key": "equipment",
          "type": "label",
          "value": "EQUIPMENT :",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_1_cell_4_Dasafe_Equipment",
          "key": "Dasafe_Equipment",
          "type": "input",
          "value": "",
          "rows": null,
          "disabled": true,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left",
          "isDynamic": true,
          "lookupKey": "context.equipment_name",
          "prefill": true,
          "prefillSource": "context.equipment_name"
        }
      ]
    },
    {
      _id: 'sectionone_table_0_row_2',
      cells: [
        {
          "_id": "sectionone_table_0_row_2_cell_1_static",
          "key": "make",
          "type": "label",
          "value": "MAKE",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_2_cell_2_Dasafe_Ship_MAKE_MODEL",
          "key": "Dasafe_Ship_MAKE_MODEL",
          "type": "input",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": false,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_2_cell_3_static",
          "key": "date_of_trial",
          "type": "label",
          "value": "DATE OF TRIAL :",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_2_cell_4_Dasafe_DATE_TRIAL",
          "key": "Dasafe_DATE_TRIAL",
          "type": "date",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": false,
          "placeholder": "",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        }
      ]
    },
    {
      _id: 'sectionone_table_0_row_3',
      cells: [
        {
          "_id": "sectionone_table_0_row_3_cell_1_static",
          "key": "model",
          "type": "label",
          "value": "Model",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_3_cell_2_Dasafe_Model",
          "key": "Dasafe_Model",
          "type": "input",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": true,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_3_cell_3_static",
          "key": "equipment_serial_number",
          "type": "label",
          "value": "EQUIPMENT SERIAL NUMBER",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_3_cell_4_Dasafe_Equipment_Serial_Number",
          "key": "Dasafe_Equipment_Serial_Number",
          "type": "input",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": true,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        }
      ]
    },
    {
      _id: 'sectionone_table_0_row_4',
      cells: [
        {
          "_id": "sectionone_table_0_row_4_cell_1_static",
          "key": "occasion_of_trial",
          "type": "label",
          "value": "OCCASION OF TRIAL :",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_4_cell_2_Dasafe_Ship_OCC",
          "key": "Dasafe_Ship_OCC",
          "type": "input",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": false,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_4_cell_3_static",
          "key": "running_hour_since_installation",
          "type": "label",
          "value": "R/H SINCE INSTALLATION :",
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        },
        {
          "_id": "sectionone_table_0_row_4_cell_4_Dasafe_Ship_R_H_INST",
          "key": "Dasafe_Ship_R_H_INST",
          "type": "input",
          "value": "",
          "rows": null,
          "required": false,
          "disabled": false,
          "placeholder": "",
          "inputType": "text",
          "options": null,
          "colspan": 1,
          "rowspan": 1,
          "align": "left"
        }
      ]
    }
  ],
  "showRowActions": false,
  "minRows": 1
}
};

export const DA_SURPRISE_SAFETY = {
    columns: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT", "UNIT", "OBSERVED VALUE", "REMARKS"],
    colConfig: [ "Sr No", "PARAMETER", "LOCATION", "LOWER- UPPER LIMIT"],
    fristTable: {
    id: 'sectionone_table_0',
    sectionType: 'matrixTable',
    title: ' <h2>MAIN ENGINE SURPRISE SAFETY DEVICE CHECKS</h2>',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_2_dassdc_ship",
            "key": "dassdc_ship",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.ship_name",
            "prefill": true,
            "prefillSource": "context.ship_name"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_3_static",
            "key": "date",
            "type": "label",
            "value": "Date:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_4_dassdc_date",
            "key": "dassdc_date",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_2',
        cells: [
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "occasion_for_trial",
            "type": "label",
            "value": "OCCASION for Trial:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_2_dassdc_occasion_of_trial",
            "key": "dassdc_occasion_of_trial",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_3_static",
            "key": "running_hour_since_installation",
            "type": "label",
            "value": "R/H SINCE INSTALLATION:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_4_dassdc_rh_since_install",
            "key": "dassdc_rh_since_install",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_3',
        cells: [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "key": "make",
            "type": "label",
            "value": "MAKE:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_dassdc_make",
            "key": "dassdc_make",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_3_static",
            "key": "model",
            "type": "label",
            "value": "MODEL:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_4_dassdc_model",
            "key": "dassdc_model",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_4',
        cells: [
          {
            "_id": "sectionone_table_0_row_4_cell_1_static",
            "key": "equipment",
            "type": "label",
            "value": "Equipment:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_2_dassdc_equipment",
            "key": "dassdc_equipment",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.equipment_name",
            "prefill": true,
            "prefillSource": "context.equipment_name"
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
};

export const ME_LOAD = {
  columns: [
    "Sr No",
    "PARAMETER",
    "LOCATION",
    "LOWER- UPPER LIMIT",
        "UNIT",                        
        "OBSERVED VALUE @ 25% LOAD",   
        "OBSERVED VALUE @ 50% LOAD",   
        "OBSERVED VALUE @ 75% LOAD",   
        "OBSERVED VALUE @ 100% LOAD",  
        "OBSERVED VALUE D @ 100% LOAD",
        "REMARKS"                       
  ],
  colConfig: [
    "Sr No",
    "PARAMETER",
    "LOCATION",
    "LOWER- UPPER LIMIT"
  ],
  fristTable: {
    id: 'sectionone_table_0',
    sectionType: 'matrixTable',
    title: ' <h2>PROFORMA FOR LOAD TRIALS OF DIESEL ENGINES</h2>',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_2_MeLoad_Ship",
            "key": "MeLoad_Ship",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_3_static",
            "key": "equipment",
            "type": "label",
            "value": "EQUIPMENT :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_4_MeLoad_EQUIPMENT",
            "key": "MeLoad_EQUIPMENT",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.equipment_name",
            "prefill": true,
            "prefillSource": "context.equipment_name"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_2',
        cells: [
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "engine_make",
            "type": "label",
            "value": "ENGINE MAKE",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_2_MeLoad_ENGINE_MAKE_MODEL",
            "key": "MeLoad_ENGINE_MAKE_MODEL",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_3_static",
            "key": "date_of_trial",
            "type": "label",
            "value": "DATE OF TRIAL :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_4_MeLoad_DATE_TRIAL",
            "key": "MeLoad_DATE_TRIAL",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_3',
        cells: [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "key": "model",
            "type": "label",
            "value": "Model",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_MeLoad_MODEL",
            "key": "MeLoad_MODEL",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_4',
        cells: [
          {
            "_id": "sectionone_table_0_row_4_cell_1_static",
            "key": "equipment_serial_number",
            "type": "label",
            "value": "Equipment Serial Number",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_2_MeLoad_Equipment_Serial_Number",
            "key": "MeLoad_Equipment_Serial_Number",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_5',
        cells: [
          {
            "_id": "sectionone_table_0_row_5_cell_1_static",
            "key": "occasion_type_of_trials",
            "type": "label",
            "value": "OCCASION & TYPE OF TRIALS :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_2_MeLoad_OCCASION_TYPE_TRIALS",
            "key": "MeLoad_OCCASION_TYPE_TRIALS",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_6',
        cells: [
          {
            "_id": "sectionone_table_0_row_6_cell_1_static",
            "key": "running_hour_post_major_overhaul",
            "type": "label",
            "value": "RUNNING HOUR POST MAJOR OVERHAUL:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_6_cell_2_MeLoad_RUN_POST_MAJOR",
            "key": "MeLoad_RUN_POST_MAJOR",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_7',
        cells: [
          {
            "_id": "sectionone_table_0_row_7_cell_1_static",
            "key": "running_hour_since_installation",
            "type": "label",
            "value": "RUNNING HOUR SINCE INSTALLATION :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_2_MeLoad_RUN_INSTALLATION",
            "key": "MeLoad_RUN_INSTALLATION",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 3,
            "rowspan": 1,
            "align": "left"
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
};

export const ME_RH_EXT = {
    columns: [
        "Sr No",
        "PARAMETER",
        "LOCATION",
        "LOWER- UPPER LIMIT",
        "UNIT",
        "OBSERVED VALUE @ 25% LOAD",
        "OBSERVED VALUE @ 50% LOAD",
        "OBSERVED VALUE @ 75% LOAD",
        "OBSERVED VALUE @ 100% LOAD",
        "OBSERVED VALUE D @ 100% LOAD",
        "REMARKS"
    ],
    colConfig: [
        "Sr No",
        "PARAMETER",
        "LOCATION",
        "LOWER- UPPER LIMIT"
    ],
    fristTable: {
    id: 'sectionone_table_0',
    title: '<h2>PROFORMA FOR LIFE EXTENSION TRIALS OF DIESEL ENGINES</h2>',
    sectionType: 'matrixTable',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_2_Ship",
            "key": "Ship",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_2',
        cells: [
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "name_of_equipment",
            "type": "label",
            "value": "Name of Equipment",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_3',
        cells: [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "key": "engine_type_make_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_static",
            "key": "engine_type_make_label",
            "type": "label",
            "value": "Engine Type and Make",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_3_Engine_Type_Make",
            "key": "Engine_Type_Make",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_4',
        cells: [
          {
            "_id": "sectionone_table_0_row_4_cell_1_static",
            "key": "rated_maximum_rpm_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_2_static",
            "key": "rated_maximum_rpm_label",
            "type": "label",
            "value": "Rated Maximum RPM",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_3_Rated_Maximum_RPM",
            "key": "Rated_Maximum_RPM",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_5',
        cells: [
          {
            "_id": "sectionone_table_0_row_5_cell_1_static",
            "key": "equipment_serial_no_serial",
            "type": "label",
            "value": "(C)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_2_static",
            "key": "equipment_serial_no_label",
            "type": "label",
            "value": "Equipment Serial No",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_5_cell_3_Equipment_Serial_No",
            "key": "Equipment_Serial_No",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_6',
        cells: [
          {
            "_id": "sectionone_table_0_row_6_cell_1_static",
            "key": "running_hours",
            "type": "label",
            "value": "Running Hours",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_7',
        cells: [
          {
            "_id": "sectionone_table_0_row_7_cell_1_static",
            "key": "since_installation_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_2_static",
            "key": "since_installation_label",
            "type": "label",
            "value": "Since Installation",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_7_cell_3_Since_Installation",
            "key": "Since_Installation",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_8',
        cells: [
          {
            "_id": "sectionone_table_0_row_8_cell_1_static",
            "key": "since_last_major_routine_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_8_cell_2_static",
            "key": "since_last_major_routine_label",
            "type": "label",
            "value": "Since Last Major Routine",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_8_cell_3_Since_Last_Major_Routine",
            "key": "Since_Last_Major_Routine",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_9',
        cells: [
          {
            "_id": "sectionone_table_0_row_9_cell_1_static",
            "key": "last_major_routine_undertaken",
            "type": "label",
            "value": "Last Major Routine Undertaken",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_9_cell_2_Last_Major_Routine_Undertaken",
            "key": "Last_Major_Routine_Undertaken",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_10',
        cells: [
          {
            "_id": "sectionone_table_0_row_10_cell_1_static",
            "key": "past_history_equipment",
            "type": "label",
            "value": "Past History of Equipment (Indicate major defects observed/ Assemblies replaced during the operation period)",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_10_cell_2_Past_History_Equipment",
            "key": "Past_History_Equipment",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_11',
        cells: [
          {
            "_id": "sectionone_table_0_row_11_cell_1_static",
            "key": "state_of_safety_devices",
            "type": "label",
            "value": "State of Safety Devices (Date last checked and present Ops status.) Attach SDC report.",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_11_cell_2_State_of_Safety_Devices",
            "key": "State_of_Safety_Devices",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_12',
        cells: [
          {
            "_id": "sectionone_table_0_row_12_cell_1_static",
            "key": "details_ss_routines_completed",
            "type": "label",
            "value": "Details of SS Routines completed",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_12_cell_2_Details_SS_Routines_completed",
            "key": "Details_SS_Routines_completed",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_13',
        cells: [
          {
            "_id": "sectionone_table_0_row_13_cell_1_static",
            "key": "tentative_dates_for",
            "type": "label",
            "value": "Tentative dates for",
            "colspan": 3,
            "rowspan": 1,
            "align": "center"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_14',
        cells: [
          {
            "_id": "sectionone_table_0_row_14_cell_1_static",
            "key": "installation_instrumentation_serial",
            "type": "label",
            "value": "(A)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_14_cell_2_static",
            "key": "installation_instrumentation_label",
            "type": "label",
            "value": "Installation, Instrumentation and safety devices checks",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_14_cell_3_Installation_Instrumentation",
            "key": "Installation_Instrumentation",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_15',
        cells: [
          {
            "_id": "sectionone_table_0_row_15_cell_1_static",
            "key": "load_trials_sea_trials_serial",
            "type": "label",
            "value": "(B)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_15_cell_2_static",
            "key": "load_trials_sea_trials_label",
            "type": "label",
            "value": "Load Trials/ Sea Trials",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_15_cell_3_Load_Trials_Sea_Trials",
            "key": "Load_Trials_Sea_Trials",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_16',
        cells: [
          {
            "_id": "sectionone_table_0_row_16_cell_1_static",
            "key": "hours_proposed_extension",
            "type": "label",
            "value": "Hours proposed for extension",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_16_cell_2_Hours_proposed_extension",
            "key": "Hours_proposed_extension",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_17',
        cells: [
          {
            "_id": "sectionone_table_0_row_17_cell_1_static",
            "key": "attach_parameter_sheet",
            "type": "label",
            "value": "Attach Parameter sheet corresponding to the max. load/ ERPM achieved in the last one month",
            "colspan": 2,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_17_cell_2_Attach_Parameter_sheet",
            "key": "Attach_Parameter_sheet",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
};

export const ME_SAFETY = {
    columns: [
        "Sr No",                  
        "PARAMETER",            
        "LOCATION",             
        "LOWER- UPPER LIMIT",   
        "UNIT",                
        "OBSERVED VALUE",      
        "REMARKS"               
    ],
    colConfig: [
        "Sr No",
        "PARAMETER",
        "LOCATION",
        "LOWER- UPPER LIMIT",
    ],
    fristTable: {
    id: 'sectionone_table_0',
    sectionType: 'matrixTable',
    title: 'h2>ME SAFTEY DEVICE CHECKS</h2>',
    rows: [
      {
        _id: 'sectionone_table_0_row_1',
        cells: [
          {
            "_id": "sectionone_table_0_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_2_Mesafe_Ship",
            "key": "Mesafe_Ship",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.ship_name",
            "prefill": true,
            "prefillSource": "context.ship_name"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_3_static",
            "key": "equipment",
            "type": "label",
            "value": "EQUIPMENT :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_1_cell_4_Mesafe_Equipment",
            "key": "Mesafe_Equipment",
            "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.equipment_name",
            "prefill": true,
            "prefillSource": "context.equipment_name"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_2',
        cells: [
          {
            "_id": "sectionone_table_0_row_2_cell_1_static",
            "key": "make",
            "type": "label",
            "value": "MAKE:",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_2_Mesafe_Ship_MAKE_MODEL",
            "key": "Mesafe_Ship_MAKE_MODEL",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_3_static",
            "key": "date_of_trial",
            "type": "label",
            "value": "DATE OF TRIAL :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_2_cell_4_Mesafe_DATE_TRIAL",
            "key": "Mesafe_DATE_TRIAL",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_3',
        cells: [
          {
            "_id": "sectionone_table_0_row_3_cell_1_static",
            "key": "model",
            "type": "label",
            "value": "Model :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_2_Mesafe_Model",
            "key": "Mesafe_Model",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_3_static",
            "key": "equipment_serial_number",
            "type": "label",
            "value": "Equipment Serial Number :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_3_cell_4_Mesafe_Equipment_Serial_Number",
            "key": "Mesafe_Equipment_Serial_Number",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      },
      {
        _id: 'sectionone_table_0_row_4',
        cells: [
          {
            "_id": "sectionone_table_0_row_4_cell_1_static",
            "key": "occasion_of_trial",
            "type": "label",
            "value": "OCCASION OF TRIAL :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_2_Mesafe_Ship_OCC",
            "key": "Mesafe_Ship_OCC",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_3_static",
            "key": "running_hour_since_installation",
            "type": "label",
            "value": "R/H SINCE INSTALLATION :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "sectionone_table_0_row_4_cell_4_Mesafe_Ship_R_H_INST",
            "key": "Mesafe_Ship_R_H_INST",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
};

export const ME_SURPRISE_SAFETY = {
    columns: [
        "Sr No",                 
        "PARAMETER",           
        "LOCATION",            
        "LOWER- UPPER LIMIT",  
        "UNIT",                
        "OBSERVED VALUE",      
        "REMARKS"               
    ],
    colConfig: [
        "Sr No",
        "PARAMETER",
        "LOCATION",
        "LOWER- UPPER LIMIT",
    ],
    fristTable: {
      id: 'sectionone_table_0',
      sectionType: 'matrixTable',
      title: ' <h2>MAIN ENGINE SURPRISE SAFETY DEVICE CHECKS</h2>',
      rows: [
        {
          _id: 'sectionone_table_0_row_1',
          cells: [
            {
              "_id": "sectionone_table_0_row_1_cell_1_static",
              "key": "ship",
              "type": "label",
              "value": "Ship:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_1_cell_2_me_ship",
              "key": "me_ship",
              "type": "input",
              "value": "",
              "rows": null,
              "disabled": true,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 1,
              "rowspan": 1,
              "align": "left",
              "isDynamic": true,
              "lookupKey": "context.ship_name",
              "prefill": true,
              "prefillSource": "context.ship_name"
            },
            {
              "_id": "sectionone_table_0_row_1_cell_3_static",
              "key": "date",
              "type": "label",
              "value": "Date:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_1_cell_4_me_date",
              "key": "me_date",
              "type": "date",
              "value": "",
              "rows": null,
              "required": false,
              "disabled": false,
              "placeholder": "",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            }
          ]
        },
        {
          _id: 'sectionone_table_0_row_2',
          cells: [
            {
              "_id": "sectionone_table_0_row_2_cell_1_static",
              "key": "occasion_for_trial",
              "type": "label",
              "value": "OCCASION for Trial:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_2_cell_2_me_occasion_of_trial",
              "key": "me_occasion_of_trial",
              "type": "input",
              "value": "",
              "rows": null,
              "required": false,
              "disabled": false,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_2_cell_3_static",
              "key": "running_hour_since_installation",
              "type": "label",
              "value": "R/H SINCE INSTALLATION:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_2_cell_4_me_rh_since_install",
              "key": "me_rh_since_install",
              "type": "input",
              "value": "",
              "rows": null,
              "required": false,
              "disabled": false,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            }
          ]
        },
        {
          _id: 'sectionone_table_0_row_3',
          cells: [
            {
              "_id": "sectionone_table_0_row_3_cell_1_static",
              "key": "make",
              "type": "label",
              "value": "MAKE:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_3_cell_2_me_make",
              "key": "me_make",
              "type": "input",
              "value": "",
              "rows": null,
              "required": false,
              "disabled": false,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_3_cell_3_static",
              "key": "model",
              "type": "label",
              "value": "MODEL:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_3_cell_4_me_model",
              "key": "me_model",
              "type": "input",
              "value": "",
              "rows": null,
              "required": false,
              "disabled": true,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            }
          ]
        },
        {
          _id: 'sectionone_table_0_row_4',
          cells: [
            {
              "_id": "sectionone_table_0_row_4_cell_1_static",
              "key": "equipment",
              "type": "label",
              "value": "Equipment:",
              "colspan": 1,
              "rowspan": 1,
              "align": "left"
            },
            {
              "_id": "sectionone_table_0_row_4_cell_2_me_equipment",
              "key": "me_equipment",
              "type": "input",
              "value": "",
              "rows": null,
              "disabled": true,
              "placeholder": "",
              "inputType": "text",
              "options": null,
              "colspan": 3,
              "rowspan": 1,
              "align": "left",
              "isDynamic": true,
              "lookupKey": "context.equipment_name",
              "prefill": true,
              "prefillSource": "context.equipment_name"
            }
          ]
        }
      ],
      "showRowActions": false,
      "minRows": 1
    }
  
};


export function makeSimpleMatrixTableObject(
    tableId: string,
    tableHeader: string,
    columns: string[],
    prefillValues: Record<string, any>[]
  ) {
    const makeKey = (value: string): string => {
      return value
        .toString()
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
    };
  
    const allColumns = [...columns];
  
    return {
      id: tableId,
      sectionType: 'matrixTable',
      title: tableHeader,
      "showRowActions": true,
      "minRows": 1,
        
      columns: allColumns.map((columnName) => ({
        key: makeKey(columnName),
        label: columnName,
        type: 'label',
        align: 'left'
      })),
  
      rows: prefillValues.map((rowData, rowIndex) => {
        const rowNo = rowIndex + 1;
  
        return {
          _id: `${tableId}_row_${rowNo}`,
  
          cells: allColumns.map((columnName, columnIndex) => {
            const cellNo = columnIndex + 1;
            const columnKey = makeKey(columnName);
  
            if (columnName === 'Sr No') {
              return {
                _id: `${tableId}_row_${rowNo}_cell_${cellNo}_static`,
                key: columnKey,
                type: 'serial',
                value: rowNo,
                colspan: 1,
                rowspan: 1,
                align: 'center'
              };
            }
  
            const value = rowData[columnName] ?? '';
  
            return {
              _id: `${tableId}_row_${rowNo}_cell_${cellNo}_${columnKey}`,
              key: columnKey,
              type: 'input',
              value: value,
  
              rows: null,
              required: false,
              disabled: value !== '',
              inputType: 'text',
             
  
              colspan: 1,
              rowspan: 1,
              align: 'left',
  
              
            };
          })
        };
      })
    };
  }

 export const fields_1 = [
    {
      "_id": "fields_1_row_1_cell_1_ship",
      "key": "Ship",
      "name": "Ship",
      "label": "Ship :",
      "type": "input",
      "value": "",
      "disabled": true,
      "placeholder": "",
      "inputType": "text",
      "options": null,
      "colspan": 1,
      "rowspan": 1,
      "align": "left",
      "isDynamic": false,
      "lookupKey": null,
      "prefill": false,
      "prefillSource": null
      
    },
    {
      "type": "input",
      "name": "DATE_OF_TRIAL",
      "key": "DATE_OF_TRIAL",
      "label": "Date:",
      "colSpan": 6,
      "required": false,
      "disabled": false,
      "placeholder": "",
      "value": "",
      "inputType": "date",
      "options": null,
      "isDynamic": false,
      "lookupKey": null,
      "prefill": false,
      "prefillSource": null,
      "lockAfterPrefill": false,
      "hiddenKey": null,
      "displayKey": null,
      "rows": 1
    }
  ];
 export const tables_1 =  [
  {
    "id": "section_1_table_1",
    "sectionType": "simpleTable",
    "topHeaders": [],
    
    "rows": [
      {
        "_id": "section_1_table_1_row_1",
        "cells": [
          {
            "_id": "section_1_table_1_row_1_cell_1_static",
            "key": "ship",
            "type": "label",
            "value": "Ship :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_1_row_1_cell_2_ship",
            "key": "ship",
           "type": "input",
            "value": "",
            "rows": null,
            "disabled": true,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": true,
            "lookupKey": "context.ship_name",
            "prefill": true,
            "prefillSource": "context.ship_name"
          },
          {
            "_id": "section_1_table_1_row_1_cell_3_static",
            "key": "date",
            "type": "label",
            "value": "Date :",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_1_row_1_cell_4_dATEOFTRIAL",
            "key": "dATEOFTRIAL",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "date",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  },
  {
    "id": "section_1_table_2",
    "sectionType": "matrixTable",
    "title": "",
    "topHeaders": [
      [
        {
          "label": "1. Name of the engine",
          "colspan": 2,
          "rowspan": 1,
          "align": "left"
        }
      ]
    ],
    "columns": [],
    "rows": [
      {
        "_id": "section_1_table_2_row_1",
        "cells": [
          {
            "_id": "section_1_table_2_row_1_cell_1_static",
            "key": "a_engine_type_make_and_rating",
            "type": "label",
            "value": "(A) Engine Type, make, and rating",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_2_row_1_cell_2_engineTypeMakeRating",
            "key": "engineTypeMakeRating",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_2_row_2",
        "cells": [
          {
            "_id": "section_1_table_2_row_2_cell_1_static",
            "key": "b_rated_maximum_rpm",
            "type": "label",
            "value": "(B) Rated/Maximum RPM",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_2_row_2_cell_2_ratedMaximumRPM",
            "key": "ratedMaximumRPM",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_2_row_3",
        "cells": [
          {
            "_id": "section_1_table_2_row_3_cell_1_static",
            "key": "c_engine_s_no",
            "type": "label",
            "value": "(C) Engine S.No",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_2_row_3_cell_2_engineSerialNo",
            "key": "engineSerialNo",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  },
  {
    "id": "section_1_table_3",
    "sectionType": "matrixTable",
    "title": "DIESEL ENGINE PRE-TRIAL INFORMATION PROFORMA",
    "topHeaders": [
      [
        {
          "label": "2. Routine carried out",
          "colspan": 2,
          "rowspan": 1,
          "align": "left"
        }
      ]
    ],
    "columns": [],
    "rows": [
      {
        "_id": "section_1_table_3_row_1",
        "cells": [
          {
            "_id": "section_1_table_3_row_1_cell_1_static",
            "key": "a_routine_repair_done_as_part_of_maintenance_schedule_or_due_to_specific_defect",
            "type": "label",
            "value": "(A) Routine/repair done as part of maintenance schedule or due to specific defect",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_3_row_1_cell_2_specificDefect",
            "key": "specificDefect",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_3_row_2",
        "cells": [
          {
            "_id": "section_1_table_3_row_2_cell_1_static",
            "key": "b_if_routine_repair_due_to_specific_defect_describe_details_of_defect",
            "type": "label",
            "value": "(B) If routine/repair due to specific defect describe details of defect",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_3_row_2_cell_2_specificDefectDescribe",
            "key": "specificDefectDescribe",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_3_row_3",
        "cells": [
          {
            "_id": "section_1_table_3_row_3_cell_1_static",
            "key": "c_major_components_changed_during_routine_repair",
            "type": "label",
            "value": "(C) Major components changed during routine/repair",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_3_row_3_cell_2_majorComponentsChanged",
            "key": "majorComponentsChanged",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_3_row_4",
        "cells": [
          {
            "_id": "section_1_table_3_row_4_cell_1_static",
            "key": "d_has_work_been_done_on_governor_fuel_injection_pump_turbocharge",
            "type": "label",
            "value": "(D) Has work been done on governor/fuel injection pump/turbocharge?",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_3_row_4_cell_2_fuelInjection",
            "key": "fuelInjection",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  },
  {
    "id": "section_1_table_4",
    "sectionType": "matrixTable",
    "title": "DIESEL ENGINE PRE-TRIAL INFORMATION PROFORMA",
    "topHeaders": [],
    "columns": [
      {
        "key": "ser",
        "label": "Ser",
        "type": "serial",
        "align": "center"
      },
      {
        "key": "column_2",
        "label": "Column 2",
        "type": "label",
        "align": "left"
      }
    ],
    "rows": [
      {
        "_id": "section_1_table_4_row_1",
        "cells": [
          {
            "_id": "section_1_table_4_row_1_cell_1_static",
            "key": "3_total_running_hours_since_installation",
            "type": "label",
            "value": "3. Total running hours since installation",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_1_cell_2_totalRunningHours",
            "key": "totalRunningHours",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_2",
        "cells": [
          {
            "_id": "section_1_table_4_row_2_cell_1_static",
            "key": "4_past_history_of_equepment_if_any_known_characterstics",
            "type": "label",
            "value": "4. Past history of equepment(if any known characterstics)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_2_cell_2_pastHistoryEquipment",
            "key": "pastHistoryEquipment",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_3",
        "cells": [
          {
            "_id": "section_1_table_4_row_3_cell_1_static",
            "key": "5_any_limitation_anticipated_after_present_repiar_due_to_non_availability_of_aparticular_critical_spare_for_routine_repair_etc",
            "type": "label",
            "value": "5. Any limitation anticipated after present repiar (due to non-availability of aparticular critical spare for routine/repair etc)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_3_cell_2_stateOfSafetyDevices",
            "key": "stateOfSafetyDevices",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_4",
        "cells": [
          {
            "_id": "section_1_table_4_row_4_cell_1_static",
            "key": "6_type_of_lube_oil_used_in_equipment",
            "type": "label",
            "value": "6. Type of lube oil used in equipment",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_4_cell_2_typeOfLube",
            "key": "typeOfLube",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_5",
        "cells": [
          {
            "_id": "section_1_table_4_row_5_cell_1_static",
            "key": "7_type_of_additive_used_in_fresh_water_system",
            "type": "label",
            "value": "7. Type of additive used in fresh water system",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_5_cell_2_typeOfAdditiveUsed",
            "key": "typeOfAdditiveUsed",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_6",
        "cells": [
          {
            "_id": "section_1_table_4_row_6_cell_1_static",
            "key": "8_wether_trials_of_engine_done_on_test_bed_prior_to_installation_on_board_after_routine_repair",
            "type": "label",
            "value": "8. Wether trials of engine done on test bed prior to installation on board after routine/repair",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_6_cell_2_installationOnBoard",
            "key": "installationOnBoard",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_7",
        "cells": [
          {
            "_id": "section_1_table_4_row_7_cell_1_static",
            "key": "9_confirm_engine_de_preserved_and_system_proved",
            "type": "label",
            "value": "9. Confirm engine de-preserved and system proved",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_7_cell_2_systemProved",
            "key": "systemProved",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_8",
        "cells": [
          {
            "_id": "section_1_table_4_row_8_cell_1_static",
            "key": "10_fuel_lub_oil_ru_tanks_and_system_cleaned_flushed_through",
            "type": "label",
            "value": "10. Fuel/lub oil RU tanks and system cleaned/flushed through",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_8_cell_2_lubOilRUTanks",
            "key": "lubOilRUTanks",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_9",
        "cells": [
          {
            "_id": "section_1_table_4_row_9_cell_1_static",
            "key": "11_state_of_fuel_lub_centrifuge_ops_non_ops",
            "type": "label",
            "value": "11. State of fuel/lub centrifuge(ops/non ops)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_9_cell_2_detailsSSRoutinesCompleted",
            "key": "detailsSSRoutinesCompleted",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_10",
        "cells": [
          {
            "_id": "section_1_table_4_row_10_cell_1_static",
            "key": "12_state_type_of_safety_devices_wether_in_place_or_not",
            "type": "label",
            "value": "12. state/type of safety devices( wether in place or not)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_10_cell_2_safetyDevices",
            "key": "safetyDevices",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_11",
        "cells": [
          {
            "_id": "section_1_table_4_row_11_cell_1_static",
            "key": "13_state_of_instrumentation_and_controls_indicate_deficiencies_if_any",
            "type": "label",
            "value": "13. State of instrumentation and controls (indicate deficiencies if any)",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_11_cell_2_stateOfInstrumentation",
            "key": "stateOfInstrumentation",
            "type": "input",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "text",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_12",
        "cells": [
          {
            "_id": "section_1_table_4_row_12_cell_1_static",
            "key": "14_tentative_date_of_diesel_instrumentation_protection_devices_checks_and_load_governor_trials",
            "type": "label",
            "value": "14. Tentative date of diesel instrumentation/protection devices checks and load/governor trials",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_12_cell_2_tentativeDate",
            "key": "tentativeDate",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "date",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      },
      {
        "_id": "section_1_table_4_row_13",
        "cells": [
          {
            "_id": "section_1_table_4_row_13_cell_1_static",
            "key": "15_approximate_date_of_refit_completion",
            "type": "label",
            "value": "15. Approximate date of refit completion",
            "colspan": 1,
            "rowspan": 1,
            "align": "left"
          },
          {
            "_id": "section_1_table_4_row_13_cell_2_approximateDate",
            "key": "approximateDate",
            "type": "date",
            "value": "",
            "rows": null,
            "required": false,
            "disabled": false,
            "placeholder": "",
            "inputType": "date",
            "options": null,
            "colspan": 1,
            "rowspan": 1,
            "align": "left",
            "isDynamic": false,
            "lookupKey": null,
            "prefill": null,
            "prefillSource": null,
            "lockAfterPrefill": null,
            "hiddenKey": null,
            "displayKey": null
          }
        ]
      }
    ],
    "showRowActions": false,
    "minRows": 1
  }
]
