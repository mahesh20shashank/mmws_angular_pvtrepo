import { DropdownOption } from '../../api.service';

/** Shared between Transaction Trail and Initiate Trials dialog */
export interface TransactionOptionMap {
  status: DropdownOption<string>[];
  ship: DropdownOption[];
  satelliteUnit: DropdownOption[];
  subSatelliteUnit: DropdownOption[];
  trialType: DropdownOption<string>[];
  equipment: DropdownOption[];
  system?: DropdownOption[];
  subsystem?: DropdownOption[];
  section: DropdownOption[];
  trialUnit: DropdownOption[];
  refitType: DropdownOption<string>[];
}
