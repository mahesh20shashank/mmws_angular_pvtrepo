import { AbstractControl, ValidationErrors, Validators, ValidatorFn } from "@angular/forms";

/** A defect can't have occurred in the future. Compares plain `yyyy-mm-dd` strings
 * rather than `Date` objects: `new Date("yyyy-mm-dd")` parses as UTC midnight, which
 * in a UTC+ timezone falls *before* local midnight for that same calendar day —
 * comparing `Date`s there flags today's own date as "future". */
export const dateNotInFutureValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  if (!control.value) {
    return null;
  }

  const todayIso = new Date().toLocaleDateString("en-CA");

  return String(control.value) > todayIso ? { dateInFuture: true } : null;
};

export interface FormField {
  key: string;
  label: string;
  controlType:
  | "text"
  | "number"
  | "date"
  | "select"
  | "textarea"
  | "file"
  | "radio";
  placeholder: string;
  fullWidth?: boolean;
  readonly?: boolean;
  validators?: ValidatorFn[];
  defaultValue?: string | number | boolean | null;
  options?: {
    label: string;
    value: string | number | boolean;
  }[];

  resetOnChange?: string[];

  showWhen?: {
    field: string;
    value: string | number | boolean;
  };
}

export const GUARANTEE_DEFECT_FIELDS: FormField[] = [
  {
    key: "equipmentName",
    label: "Equipment Name",
    placeholder: "Select an option",
    controlType: "select",
    validators: [Validators.required],
  },

  {
    key: "equipmentNomenclature",
    label: "Equipment Nomenclature",
    placeholder: "Select an option",
    controlType: "select",
    validators: [Validators.required],
  },

  {
    key: "equipmentSerialNo",
    label: "Eqpt. Serial No",
    placeholder: "Eqpt. Serial No",
    controlType: "text",
    readonly: true,
  },

  {
    key: "onBoardLocation",
    label: "On Board Location",
    placeholder: "On Board Location",
    controlType: "text",
    readonly: true,
  },

  {
    key: "defectDate",
    label: "Defect Date",
    placeholder: "Select Defect Date",
    controlType: "date",
    validators: [Validators.required, dateNotInFutureValidator],
  },

  {
    key: "defectDescription",
    label: "Defect Description",
    placeholder: "Enter Defect / Assistance details",
    controlType: "textarea",
    fullWidth: true,
    validators: [Validators.required],
  },

  {
    key: "causeOfDefect",
    label: "Cause / Reason for the Defect",
    placeholder: "Enter Cause / Reason",
    controlType: "textarea",
    fullWidth: true,
  },

  {
    key: "affectsOperationalAvailability",
    label: "Defect affects sea going and Operational Availability",
    placeholder: "",
    controlType: "radio",
    defaultValue: false,
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
  },

  {
    key: "hotWorkInvolved",
    label: "Hot Work Involved",
    placeholder: "",
    controlType: "radio",
    defaultValue: false,
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
  },

  {
    key: "repairSlipAvailability",
    label: "Date & Place when the ship will be available for repairs",
    placeholder: "Date & Place",
    controlType: "select",
    options: [
      { label: "NA", value: false },
      { label: "Date & Place", value: true },
    ],
  },

  {
    key: "completionDate",
    label: "Date of Completion",
    placeholder: "Select Date",
    controlType: "date",
  },

  {
    key: "repairDate",
    label: "Date for Repair",
    placeholder: "Select Date",
    controlType: "date",
    showWhen: {
      field: "repairSlipAvailability",
      value: true,
    },
  },

  {
    key: "repairPlace",
    label: "Place",
    placeholder: "Enter Place",
    controlType: "textarea",
    fullWidth: true,
  },

  {
    key: "attachPhotograph",
    label: "Upload Photographs/Document",
    placeholder: "Choose File",
    controlType: "file",
  },
];
