import { AbstractControl, ValidationErrors, Validators, FormGroup, ValidatorFn } from "@angular/forms";

/** Attached to `tentativeResolutionDate` — reads the sibling `defectDate` control off
 * `control.parent`, so it only activates once both fields exist on the same FormGroup.
 * `defact-form.ts` re-runs this (via `updateValueAndValidity`) whenever `defectDate`
 * changes, since a FormControl's own validators otherwise only re-run on its own value
 * changing. */
export const defectDateNotAfterResolutionValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const defectDate = control.parent?.get("defectDate")?.value;
  const resolutionDate = control.value;

  if (!defectDate || !resolutionDate) {
    return null;
  }

  return new Date(defectDate) > new Date(resolutionDate)
    ? { defectDateAfterResolution: true }
    : null;
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

  showWhen?: (form: FormGroup) => boolean;

  resetOnChange?: string[];
}

/** Attached to `defectDate` — a defect can't have occurred in the future.
 * Compares plain `yyyy-mm-dd` strings rather than `Date` objects: `new Date("yyyy-mm-dd")`
 * parses as UTC midnight, which in a UTC+ timezone falls *before* local midnight for
 * that same calendar day — comparing `Date`s there flags today's own date as "future". */
export const dateNotInFutureValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  if (!control.value) {
    return null;
  }

  const todayIso = new Date().toLocaleDateString("en-CA");

  return String(control.value) > todayIso ? { dateInFuture: true } : null;
};

export const SFD_FIELDS: FormField[] = [
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
    label: "Equipment Serial No",
    placeholder: "Equipment Serial No",
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
    key: "dartNo",
    label: "Dart No",
    placeholder: "Dart No",
    controlType: "text",
    readonly: true,
  },
  {
    key: "previousDartNo",
    label: "Previous Dart No",
    placeholder: "Previous Dart No",
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
    key: "tentativeResolutionDate",
    label: "Tentative Defect Resolution By (Dart Closing)",
    placeholder: "Defect Resolution By",
    controlType: "date",
    validators: [defectDateNotAfterResolutionValidator],
  },

  {
    key: "symptoms",
    label: "Symptoms",
    placeholder: "Select an option",
    controlType: "select",
    validators: [Validators.required],
    // options: [
    //   { label: "Low", value: "LOW" },
    //   { label: "Medium", value: "MEDIUM" },
    //   { label: "High", value: "HIGH" },
    //   { label: "Critical", value: "CRITICAL" },
    // ],
  },

  {
    key: "severity",
    label: "Severity",
    placeholder: "Select an option",
    controlType: "select",
    validators: [Validators.required],
    // options: [
    //   { label: "Low", value: "LOW" },
    //   { label: "Medium", value: "MEDIUM" },
    //   { label: "High", value: "HIGH" },
    //   { label: "Critical", value: "CRITICAL" },
    // ],
  },

  {
    key: "requiredAssistanceFor",
    label: "Required Assistance For",
    placeholder: "Select an option",
    controlType: "select",
    validators: [],
    // options: [
    //   { label: "Low", value: "LOW" },
    //   { label: "Medium", value: "MEDIUM" },
    //   { label: "High", value: "HIGH" },
    //   { label: "Critical", value: "CRITICAL" },
    // ],
  },

  {
    key: "defectiveComponent",
    label: "Defective Component",
    placeholder: "Enter Defective Component",
    controlType: "text",
    validators: [Validators.required],
  },

  {
    key: "ssRemarksResolvedBy",
    label: "SS Remarks (Resolved By)",
    placeholder: "Select Date",
    controlType: "select",
    validators: [Validators.required],
    // options: [
    //   { label: "Low", value: "LOW" },
    //   { label: "Medium", value: "MEDIUM" },
    //   { label: "High", value: "HIGH" },
    //   { label: "Critical", value: "CRITICAL" },
    // ],
  },

  {
    key: "trialRequired",
    label: "Trial Required?",
    placeholder: "",
    controlType: "radio",
    defaultValue: false,
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
    resetOnChange: ["trialAgency"],
  },

  {
    key: "trialAgency",
    label: "Trial Agency",
    placeholder: "Select Trial Agency",
    controlType: "select",
    validators: [Validators.required],
    showWhen: (form: FormGroup) => form.get("trialRequired")?.value === true,
    // options: [
    //   { label: "Agency 1", value: "AGENCY_1" },
    //   { label: "Agency 2", value: "AGENCY_2" },
    // ],
  },

  {
    key: "attachPhotograph",
    label: "Upload Photograph / Document ",
    placeholder: "Choose File",
    controlType: "file",
  },

  {
    key: "defectDescription",
    label: "Defect Description",
    placeholder: "Enter Defect / Assistance details",
    controlType: "textarea",
    fullWidth: true,
    validators: [Validators.required, Validators.maxLength(600)],
  },

  {
    key: "sparesRequired",
    label: "Spares Required?",
    placeholder: "",
    controlType: "radio",
    defaultValue: false,
    fullWidth: true,
    options: [
      { label: "No", value: false },
      { label: "Yes", value: true },
    ],
  },
];
