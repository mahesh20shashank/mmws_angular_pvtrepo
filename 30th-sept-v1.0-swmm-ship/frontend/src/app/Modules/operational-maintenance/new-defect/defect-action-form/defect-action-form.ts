import { ChangeDetectionStrategy, Component, output, signal, ViewChild } from '@angular/core';

import { AberForm } from '../aber-form/aber-form';
import { AsAndAsForm } from '../as-and-as-form/as-and-as-form';
import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ConfirmModalData } from '../../action-forms/action-forms.model';
import { DefectForm } from '../defect-form/defect-form';
import { FormModal } from '../../../../shared/components/form-modal/form-modal';
import { GuaranteeDefectForm } from '../../action-forms/guarantee-defect-form/guarantee-defect-form';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { DUMMY_RECORDED_DEFECTS, RecordedDefect } from './recorded-defects-panel/recorded-defect.model';
import { RecordedDefectsPanel } from './recorded-defects-panel/recorded-defects-panel';
import { ServicesForm } from '../services-form/services-form';

type DartReason = 'As&As' | 'ABER' | 'Defect' | 'Services' | 'Guarantee';

interface DartTypeCard {
  id: DartReason | 'OPDEF' | 'OPDEM' | 'CANDEF';
  title: string;
  desc: string;
  /** No form wired up here yet — shown but not selectable ("coming soon"). */
  disabled?: boolean;
}

/**
 * Add Defect / DART entry point. Owns only the "Select DART Type" picker; each type
 * renders its own separate, self-contained form component (`app-as-and-as-form`,
 * `app-aber-form`, `app-defect-form`, `app-services-form`, `app-guarantee-defect-form`)
 * — switching type swaps which component is rendered, instead of one shared
 * dynamic/spec-driven form. OPDEF / OPDEF (STA) / STOREDEM, OPDEM and CANDEF / CANDEM
 * have no form here yet, so their cards are shown disabled.
 */
@Component({
  selector: 'app-defect-action-form',
  standalone: true,
  imports: [
    ButtonComponent,
    IconComponent,
    AsAndAsForm,
    AberForm,
    DefectForm,
    ServicesForm,
    GuaranteeDefectForm,
    FormModal,
    RecordedDefectsPanel,
  ],
  templateUrl: './defect-action-form.html',
  styleUrl: './defect-action-form.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DefectActionForm {
  /** Emitted when the user clicks "Back to Defect / DART List", Cancel, or after a
   *  successful submit in any of the per-reason child forms. */
  readonly back = output<void>();

  readonly reasonCards: DartTypeCard[] = [
    { id: 'Defect', title: 'Defects / Routines', desc: 'Create an issue or problem faced on equipment / system' },
    { id: 'Services', title: 'Services', desc: 'Create a DART for yard services - no equipment/ system selection required' },
    { id: 'OPDEF', title: 'OPDEF / OPDEF (STA) / STOREDEM', desc: 'Raise an Operational Defect or Operational Defect (Ship Tied Alongside) or STOREDEM', disabled: true },
    { id: 'OPDEM', title: 'OPDEM', desc: 'Raise an Operational demand for spares / equipment', disabled: true },
    { id: 'CANDEF', title: 'CANDEF / CANDEM', desc: 'Cannibalize defect or demand - source an item from another ship', disabled: true },
    { id: 'Guarantee', title: 'Guarantee Defect', desc: 'Defect on equipment still within the guarantee period' },
    { id: 'As&As', title: 'As&As', desc: 'Alteration & Addition — Major or Minor' },
    { id: 'ABER', title: 'ABER', desc: 'CAT I / II / III — with or without As&As' },
  ];

  readonly reason = signal<DartReason>('Defect');

  readonly showGuaranteeConfirm = signal(false);

  /** "Recorded this session" stack (see `RecordedDefectsPanel`) — temporary static
   *  sample data. Each reason form should eventually push its own submitted entry
   *  into this array instead of the form navigating straight back on submit. */
  readonly recordedDefects = signal<RecordedDefect[]>(DUMMY_RECORDED_DEFECTS);
  readonly showRecordedPanel = signal(false);

  @ViewChild(GuaranteeDefectForm)
  guaranteeForm!: GuaranteeDefectForm;

  pickReason(card: DartTypeCard): void {
    if (card.disabled) return;
    this.reason.set(card.id as DartReason);
  }

  cancel(): void {
    this.back.emit();
  }

  /** `GuaranteeDefectForm` (unlike the other reason forms) defers its actual save to an
   *  external confirm-modal step — matching how it already works on the Action Forms page. */
  openGuaranteeConfirm(): void {
    this.showGuaranteeConfirm.set(true);
  }

  closeGuaranteeConfirm(): void {
    this.showGuaranteeConfirm.set(false);
  }

  async onGuaranteeModalSave(data: ConfirmModalData): Promise<void> {
    this.showGuaranteeConfirm.set(false);
    await this.guaranteeForm.submit(data);
  }

  closeRecordedPanel(): void {
    this.showRecordedPanel.set(false);
  }

  /** Raised via each reason form's `raiseDart` output on a successful submit. */
  onDartRaised(): void {
    this.showRecordedPanel.set(true);
  }

  /** Placeholder for the per-card "Raise RA" action — wire to the real RA-raise
   *  flow once this panel is fed real submitted entries. */
  raiseRaFor(_entry: RecordedDefect): void {}

  moveRecordedToDartList(): void {
    this.back.emit();
  }
}
