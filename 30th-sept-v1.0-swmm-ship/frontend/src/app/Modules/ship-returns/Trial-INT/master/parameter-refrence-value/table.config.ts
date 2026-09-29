export const mountAttenuationConfig = {
      topHeaders: [
        [
          { label: 'Mount No.' },
          ...Array.from({ length: 18 }, (_, i) => ({ label: `${i + 1}` }))
        ]
      ],
    
      rows: [
        // Top Row
        {
          cells: [
            { type: 'label', label: 'Top' },
            ...Array.from({ length: 18 }, (_, i) => ({
              key: `top_${i + 1}`,
              type: 'input',
              inputType: 'number'
            }))
          ]
        },
    
        // Bottom Row
        {
          cells: [
            { type: 'label', label: 'Bottom' },
            ...Array.from({ length: 18 }, (_, i) => ({
              key: `bottom_${i + 1}`,
              type: 'input',
              inputType: 'number'
            }))
          ]
        },
    
        // Attenuation %
        {
          cells: [
            { type: 'label', label: 'Attenuation %' },
            ...Array.from({ length: 18 }, (_, i) => ({
              key: `attenuation_${i + 1}`,
              type: 'input',
              inputType: 'number'
            }))
          ]
        }
      ]
    };
   export const overallVibrationConfig = {
      "id": "creat_set_parameter_reference_value",
      "title": "CREATE/SET Parameter Reference Value",
      "sectionType": "hybrid",
      "fields": [],
      "tables": [
        {
          "id": "section_1_table_3",
          "sectionType": "matrixTable",
          "title": "Applicable/NA",
          "topHeaders": [
            [
              {
                "label": "Points",
                "colspan": 1,
                "rowspan": 1,
                "align": "left"
              },
              {
                "label": "Driver FE",
                "colspan": 3,
                "rowspan": 1,
                "align": "left"
              },
              {
                "label": "Driver DE",
                "colspan": 3,
                "rowspan": 1,
                "align": "left"
              },
              {
                "label": "Driven FE",
                "colspan": 3,
                "rowspan": 1,
                "align": "left"
              },
              {
                "label": "Driven DE",
                "colspan": 3,
                "rowspan": 1,
                "align": "left"
              },
              {
                "label": "Additional",
                "colspan": 6,
                "rowspan": 1,
                "align": "left"
              }
            ],
            [
              {
                "label": "No",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "1",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "2",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "3",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "4",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "5",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "6",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "7",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "8",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "9",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "10",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "11",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "12",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "13",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "14",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "15",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "16",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "17",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "18",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              }
            ],
            [
              {
                "label": "Direction",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "H",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "V",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
              },
              {
                "label": "A",
                "colspan": 1,
                "rowspan": 1,
                "align": "center"
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
                  "key": "values_mm_sec",
                  "type": "label",
                  "value": "Values (mm/sec)",
                  "colspan": 1,
                  "rowspan": 1,
                  "align": "left"
                },
                {
                  "_id": "section_1_table_3_row_1_cell_2_valDriverFE1H",
                  "key": "valDriverFE1H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_3_valDriverFE2V",
                  "key": "valDriverFE2V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_4_valDriverFE3A",
                  "key": "valDriverFE3A",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_5_valDriverDE4H",
                  "key": "valDriverDE4H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_6_valDriverDE5V",
                  "key": "valDriverDE5V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_7_valDriverDE6A",
                  "key": "valDriverDE6A",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_8_valDriverFE7H",
                  "key": "valDriverFE7H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_9_valDriverFE8V",
                  "key": "valDriverFE8V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_10_valDriverFE9A",
                  "key": "valDriverFE9A",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_11_valDriverDE10H",
                  "key": "valDriverDE10H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_12_valDriverDE11V",
                  "key": "valDriverDE11V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_13_valDriverDE12A",
                  "key": "valDriverDE12A",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_14_valAdditional13H",
                  "key": "valAdditional13H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_15_valAdditional14V",
                  "key": "valAdditional14V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_16_valAdditional15A",
                  "key": "valAdditional15A",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_17_valAdditional16H",
                  "key": "valAdditional16H",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_18_valAdditional17V",
                  "key": "valAdditional17V",
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
                },
                {
                  "_id": "section_1_table_3_row_1_cell_19_valAdditional18A",
                  "key": "valAdditional18A",
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
                  "key": "limits_mm_sec",
                  "type": "label",
                  "value": "Limits (mm/sec)",
                  "colspan": 1,
                  "rowspan": 1,
                  "align": "left"
                },
                {
                  "_id": "section_1_table_3_row_2_cell_2_limitsDriverFEDE1",
                  "key": "limitsDriverFEDE1",
                  "type": "input",
                  "value": "",
                  "rows": null,
                  "required": false,
                  "disabled": false,
                  "placeholder": "",
                  "inputType": "text",
                  "options": null,
                  "colspan": 6,
                  "rowspan": 1,
                  "align": "left",
                  "isDynamic": false,
                  "lookupKey": null,
                  "prefill": null,
                  "prefillSource": null,
                  "lockAfterPrefill": null,
                  "hiddenKey": null,
                  "displayKey": null
                },
                {
                  "_id": "section_1_table_3_row_2_cell_3_limitsDriverFEDE2",
                  "key": "limitsDriverFEDE2",
                  "type": "input",
                  "value": "",
                  "rows": null,
                  "required": false,
                  "disabled": false,
                  "placeholder": "",
                  "inputType": "text",
                  "options": null,
                  "colspan": 6,
                  "rowspan": 1,
                  "align": "left",
                  "isDynamic": false,
                  "lookupKey": null,
                  "prefill": null,
                  "prefillSource": null,
                  "lockAfterPrefill": null,
                  "hiddenKey": null,
                  "displayKey": null
                },
                {
                  "_id": "section_1_table_3_row_2_cell_4_limitsAdditional1",
                  "key": "limitsAdditional1",
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
                },
                {
                  "_id": "section_1_table_3_row_2_cell_5_limitsAdditional2",
                  "key": "limitsAdditional2",
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
                },
                {
                  "_id": "section_1_table_3_row_2_cell_6_limitsAdditional3",
                  "key": "limitsAdditional3",
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
                },
                {
                  "_id": "section_1_table_3_row_2_cell_7_limitsAdditional4",
                  "key": "limitsAdditional4",
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
                },
                {
                  "_id": "section_1_table_3_row_2_cell_8_limitsAdditional5",
                  "key": "limitsAdditional5",
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
                },
                {
                  "_id": "section_1_table_3_row_2_cell_9_limitsAdditional6",
                  "key": "limitsAdditional6",
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
        }
        
      ]
    };
