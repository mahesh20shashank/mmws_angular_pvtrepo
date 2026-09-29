/** Shared row shape for speed transient sub-tables (ss1, ss2). */
export interface SpeedTransientSubsectionRow {
  loadInitial: string;
  loadTo: string;
}

export interface SpeedTransientSubsection {
  key: string;
  title: string;
  rows: SpeedTransientSubsectionRow[];
  /** Static % label, or user input when true. */
  peakLimitInput?: boolean;
  peakLimitLabel?: string;
  recoveryPermissibleLimit: string;
}

export interface SpeedTransientCategory {
  headerTitle: string;
  subsections: SpeedTransientSubsection[];
}

/** Matches Governor (c) Type in section 3. Equipment Details. */
export type GovernorEquipmentType =
  | 'Electronic Governor'
  | 'Mechanical Governor'
  | 'For Non-Weapon Platform'
  | 'For Ship Build Class';

const GOVERNOR_TYPE_SUBSECTION_SUFFIX: Record<GovernorEquipmentType, string> = {
  'Mechanical Governor': 'mg',
  'Electronic Governor': 'eg',
  'For Non-Weapon Platform': 'nwp',
  'For Ship Build Class': 'sbc',
};

export interface GovernorTransientTableConfig {
  categoryTitle: string;
  subsection: SpeedTransientSubsection;
}

export const TURBO_CHARGED_TRANSIENT_CATEGORY: SpeedTransientCategory = {
  headerTitle: 'For Machines Installed With Turbo - Charged Diesel Engines',
  subsections: [
    {
      key: 'turbo_mg',
      title: 'Mechanical Governor:',
      rows: [
        { loadInitial: '0', loadTo: '70' },
        { loadInitial: '100', loadTo: '0' },
      ],
      peakLimitLabel: '10%',
      recoveryPermissibleLimit: 'No Limit',
    },
    {
      key: 'turbo_eg',
      title: 'Electronic Governor:',
      rows: [
        { loadInitial: '0', loadTo: '70' },
        { loadInitial: '100', loadTo: '0' },
      ],
      peakLimitLabel: '5%',
      recoveryPermissibleLimit: '5 Sec',
    },
    {
      key: 'turbo_nwp',
      title: 'For Non Weapon Platform:',
      rows: [
        { loadInitial: '0', loadTo: '70' },
        { loadInitial: '50', loadTo: '0' },
      ],
      peakLimitLabel: '5%',
      recoveryPermissibleLimit: '5 Sec',
    },
    {
      key: 'turbo_sbc',
      title: 'For Ship Build Class:',
      rows: [
        { loadInitial: '0', loadTo: '50' },
        { loadInitial: '50', loadTo: '100' },
      ],
      peakLimitInput: true,
      recoveryPermissibleLimit: '5 Sec',
    },
  ],
};

export const NON_TURBO_CHARGED_TRANSIENT_CATEGORY: SpeedTransientCategory = {
  headerTitle: 'For Machines Other Than Turbo-Charged Diesel Engines',
  subsections: [
    {
      key: 'nonturbo_mg',
      title: 'Mechanical Governor:',
      rows: [
        { loadInitial: '0', loadTo: '100' },
        { loadInitial: '100', loadTo: '0' },
      ],
      peakLimitLabel: '10%',
      recoveryPermissibleLimit: '2 Sec',
    },
    {
      key: 'nonturbo_eg',
      title: 'Electronic Governor:',
      rows: [
        { loadInitial: '0', loadTo: '100' },
        { loadInitial: '100', loadTo: '0' },
      ],
      peakLimitLabel: '5%',
      recoveryPermissibleLimit: '2 Sec',
    },
    {
      key: 'nonturbo_nwp',
      title: 'For Non Weapon Platform:',
      rows: [
        { loadInitial: '0', loadTo: '100' },
        { loadInitial: '50', loadTo: '0' },
      ],
      peakLimitLabel: '5%',
      recoveryPermissibleLimit: '2 Sec',
    },
    {
      key: 'nonturbo_sbc',
      title: 'For Ship Build Class:',
      rows: [
        { loadInitial: '0', loadTo: '50' },
        { loadInitial: '50', loadTo: '100' },
      ],
      peakLimitInput: true,
      recoveryPermissibleLimit: '2 Sec',
    },
  ],
};

export function getGovernorTransientCategoryTables(
  governorType: string,
): GovernorTransientTableConfig[] {
  if (!governorType) {
    return [];
  }

  const suffix = GOVERNOR_TYPE_SUBSECTION_SUFFIX[governorType as GovernorEquipmentType];
  if (!suffix) {
    return [];
  }

  return [TURBO_CHARGED_TRANSIENT_CATEGORY, NON_TURBO_CHARGED_TRANSIENT_CATEGORY]
    .map((category) => {
      const subsection = category.subsections.find((item) => item.key.endsWith(`_${suffix}`));
      if (!subsection) {
        return null;
      }
      return {
        categoryTitle: category.headerTitle,
        subsection,
      };
    })
    .filter((item): item is GovernorTransientTableConfig => item !== null);
}

export const ALL_SPEED_TRANSIENT_SUBSECTIONS: SpeedTransientSubsection[] = [
  ...TURBO_CHARGED_TRANSIENT_CATEGORY.subsections,
  ...NON_TURBO_CHARGED_TRANSIENT_CATEGORY.subsections,
];

export const GOVERNOR_RANGE_LOAD_ROWS = ['0', '100'];

export const GOVERNOR_RATE_LOAD_ROWS = ['0', '100'];

export const GOVERNOR_RATE_PERMISSIBLE_LIMIT = '0.15 to 0.25Hz/ Sec';

export interface VoltageSteadyStateRow {
  loadPercent: string;
}

export const VOLTAGE_STEADY_STATE_LOAD_ROWS: VoltageSteadyStateRow[] = [
  { loadPercent: '100' },
  { loadPercent: '75' },
  { loadPercent: '50' },
  { loadPercent: '25' },
  { loadPercent: '0' },
];

export interface VoltageTransientRow {
  loadInitial: string;
  loadTo: string;
  peakPermissibleLimit: string;
  recoveryPermissibleLimit: string;
}

export const VOLTAGE_TRANSIENT_LOAD_ROWS: VoltageTransientRow[] = [
  { loadInitial: '100', loadTo: '75', peakPermissibleLimit: '7.5', recoveryPermissibleLimit: '1' },
  { loadInitial: '75', loadTo: '50', peakPermissibleLimit: '7.5', recoveryPermissibleLimit: '1' },
  { loadInitial: '50', loadTo: '25', peakPermissibleLimit: '7.5', recoveryPermissibleLimit: '1' },
  { loadInitial: '25', loadTo: '0', peakPermissibleLimit: '7.5', recoveryPermissibleLimit: '1' },
  { loadInitial: '0+M', loadTo: '', peakPermissibleLimit: '15', recoveryPermissibleLimit: '1' },
  { loadInitial: '25+M', loadTo: '', peakPermissibleLimit: '15', recoveryPermissibleLimit: '1' },
  { loadInitial: '50+M', loadTo: '', peakPermissibleLimit: '15', recoveryPermissibleLimit: '1' },
  { loadInitial: '75+M', loadTo: '', peakPermissibleLimit: '15', recoveryPermissibleLimit: '1' },
  { loadInitial: '85+M', loadTo: '', peakPermissibleLimit: '15', recoveryPermissibleLimit: '1' },
];

export const VOLTAGE_BALANCE_LOAD_ROWS = ['0', '100'];

export const VOLTAGE_RANGE_GROUPS = [
  { key: 'avr', label: 'A.V.R. Control' },
  { key: 'hand', label: 'Hand Control' },
] as const;

export const VOLTAGE_RANGE_LOAD_ROWS = ['0', '100'];
