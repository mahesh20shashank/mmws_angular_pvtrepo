export type RecordedDefectStatusTone = 'pending' | 'raised' | 'draft';

export interface RecordedDefect {
  dartNo: string;
  statusLabel: string;
  statusTone: RecordedDefectStatusTone;
  equipmentSummary: string;
  reasonLabel: string;
  severityLabel: string;
  sparesLabel: string;
  recordedAt: string;
}

/** Temporary static sample — swap for the real session list once each reason
 *  form pushes its own submitted entry into the array passed via `[defects]`. */
export const DUMMY_RECORDED_DEFECTS: RecordedDefect[] = [
  {
    dartNo: 'D-E-00151',
    statusLabel: 'Raised — pending approval',
    statusTone: 'pending',
    equipmentSummary: 'INSMA-ME-0142 | LO Pump - ME No.1 | PUMP,LUB OIL,CENT | LP-MEI-4471-A | 14,280 hrs',
    reasonLabel: 'Defects / Routines · Onboard resources exhausted',
    severityLabel: 'Normal Defect',
    sparesLabel: 'No spares',
    recordedAt: '16-Sep-2026 · 17:46 hrs',
  },
];
