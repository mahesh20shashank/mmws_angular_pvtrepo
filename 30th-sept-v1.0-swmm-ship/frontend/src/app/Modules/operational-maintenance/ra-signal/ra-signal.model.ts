export type SsRemark = 'DAN' | 'DOSSRR' | 'FMUSSRR' | 'FMUDAN';

export interface OpenDefectRow {
  id: number;
  dart_number: string;
  defect_date: string;
  equipment_name: string;
  equipment_nomenclature: string;
  description: string;
  status: 'Open' | 'Closed';
  remarks: string;
  ss_remark: SsRemark | '';
}

export interface DraftRaRow extends OpenDefectRow {
  dl_no: string;
  batch: 'Draft' | 'RA';
}

export interface SignalHistoryRow {
  date: string;
  ra_generation_date: string;
  no_of_serials: number;
  type: 'RA' | 'DL';
}

export const SS_REMARK_OPTIONS: { label: string; value: SsRemark }[] = [
  { label: 'DAN', value: 'DAN' },
  { label: 'DOSSRR', value: 'DOSSRR' },
  { label: 'FMUSSRR', value: 'FMUSSRR' },
  { label: 'FMUDAN', value: 'FMUDAN' },
];

/** The 5 dockyard export endpoints are fixed routes on the backend (no Yard
 * master table exists) — this list mirrors those routes exactly, it is not
 * placeholder data. */
export interface YardOption {
  code: string;
  label: string;
  exportPath: string;
}

export const YARD_OPTIONS: YardOption[] = [
  { code: 'ND_MBI', label: 'Mumbai (ND)', exportPath: 'export_pending_defects_dl2_accdb' },
  { code: 'ND_V', label: 'Vizag (ND)', exportPath: 'export_pending_defects_dl2_ndv' },
  { code: 'NSRY_KAR', label: 'Karwar (NSRY)', exportPath: 'export_pending_defects_dl2_nsrykar' },
  { code: 'NSRY_KOC', label: 'Kochi (NSRY)', exportPath: 'export_pending_defects_dl2_nsrykoc' },
  { code: 'NSRY_PBR', label: 'Porbandar (NSRY)', exportPath: 'export_pending_defects_dl2_nsrypbr' },
];

/** PDF is accepted by the export API but the backend only ever writes CSV/XLSX
 * content for it (mislabeled file) — omit it here until that's fixed. */
export const DL_EXPORT_FORMATS = ['CSV', 'XLSX'] as const;

/** RA's export endpoint (export_pending_defects_accdb/) takes `yard` as free
 * text in this "ND (V)"-style format, per its serializer's own help_text —
 * a different convention from DL-II's ND_V-style codes above. No Yard master
 * table exists on the backend for either flow. */
export const RA_YARD_OPTIONS = ['ND (Mbi)', 'ND (V)', 'NSRY (Kar)', 'NSRY (Koc)', 'NSRY (Pbr)'];
