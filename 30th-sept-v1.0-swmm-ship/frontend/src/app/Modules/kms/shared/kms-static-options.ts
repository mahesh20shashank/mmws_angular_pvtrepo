import { DropdownOption } from "../../../shared/components/select-input/select-input";

/** Static option lists carried over verbatim from the Django correspondence forms. */
export const UNIT_OPTIONS: DropdownOption[] = ["Mumbai", "Delhi", "Ahmedabad", "Chennai", "Kolkata"].map((v) => ({ label: v, value: v }));

export const SHIP_OPTIONS: DropdownOption[] = ["INS Vikrant", "INS Vikramaditya", "INS Chakra", "INS Arihant", "INS Kolkata"].map((v) => ({ label: v, value: v }));

export const COMMAND_OPTIONS: DropdownOption[] = [
  "Western Naval Command",
  "Eastern Naval Command",
  "Southern Naval Command",
  "Andaman and Nicobar Command",
  "Strategic Forces Command",
].map((v) => ({ label: v, value: v }));

export const REPLY_REQUIRED_OPTIONS: DropdownOption[] = [
  { label: "Yes", value: "Yes" },
  { label: "No", value: "No" },
];

export const OUTMAIL_CATEGORY_OPTIONS: DropdownOption[] = [
  { label: "Independent Outmail", value: "Independent Outmail" },
  { label: "Reply To In-mail", value: "Reply To In-mail" },
];
