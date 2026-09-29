import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, inject, OnInit, signal, ViewChild } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { DefactForm } from "./defact-form/defact-form";
import { AaAberForm } from "./aa-aber-form/aa-aber-form";
import { SpareSelectionModal } from "../../../shared/components/spare-selection-modal/spare-selection-modal"; // path adjust karo
import { GuaranteeDefectForm } from "./guarantee-defect-form/guarantee-defect-form";
import { FormModal } from "../../../shared/components/form-modal/form-modal";
import { ImagePreview } from "../../../shared/components/image-preview/image-preview";
import { SpareItem, ConfirmModalData } from "./action-forms.model";
import { DartSeedStore } from "./dart-seed-store";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";

type SpareSource = 'defect' | 'aber' | 'guarantee';

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">Raising one DART against one equipment. To raise many at once, use the <strong>Multiple DARTs</strong> tab above instead.</p>
  <h6 class="fw-bold mb-1">Filling the form</h6>
  <ul class="mb-2">
    <li>Pick the <strong>Equipment Name</strong> first — the Equipment Nomenclature list, the sub-department and the location on board all follow from it.</li>
    <li>You must fill <strong>Equipment Nomenclature</strong>, <strong>Defect Date</strong>, <strong>Symptoms</strong>, <strong>Severity</strong> and <strong>Defect Description</strong>. The Scheduled Date is set a month after the defect date for you, and can be changed.</li>
    <li>A photograph is optional and can be attached later.</li>
  </ul>
  <h6 class="fw-bold mb-1">Spares</h6>
  <p class="mb-2">Set <strong>Spares Required</strong> to Yes and pick the spares you need. What you pick goes to the storekeeper as a request against this DART — ship stock, MO, WED and PIL items each travel to the right place automatically, so you only need to find the right spare.</p>
  <h6 class="fw-bold mb-1">The popup that appears when you save</h6>
  <p class="mb-2">It asks two things about the ship, not about the defect: the <strong>maintenance period</strong> the ship is in (Operational or Refit), and the <strong>DART occasion</strong> within it. The occasion list changes to match the period you pick, and choosing AMP, SMP, EAMP or a refit occasion asks you which one, with its dates.</p>
  <h6 class="fw-bold mb-1">After saving</h6>
  <p class="mb-0">The DART is given its number and appears in the <strong>Open Defects/ DARTs</strong> tab above. It stays open until the defect is resolved and ship staff close it.</p>
`;

const REASON_QUERY_PARAM_MAP: Record<string, "defect" | "guarantee-defect" | "A&A/ABES"> = {
  "defect": "defect",
  "guarantee-defect": "guarantee-defect",
  "guarantee defect": "guarantee-defect",
  "a&a/abes": "A&A/ABES",
  "aber": "A&A/ABES",
};

@Component({
  selector: "app-action-forms",
  imports: [DefactForm, AaAberForm, SpareSelectionModal, GuaranteeDefectForm, FormModal, ImagePreview, IconComponent, HelpGuidance, ButtonComponent],
  templateUrl: "./action-forms.html",
  styleUrl: "./action-forms.css",
})
export class ActionForms implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly seedStore = inject(DartSeedStore);

  readonly helpHtml = HELP_HTML;

  activeTab: "defect" | "guarantee-defect" | "A&A/ABES" = "defect";

  /** The route to return to when this form was opened from a queue screen, and `null` when it
   * was opened the ordinary way. Held here and passed down to `DefactForm` on the same one-way
   * input path the spares already travel, so there is one hand-off channel rather than two.
   *
   * It is what makes the post-save destination and the Back button branch: with an origin,
   * both go back to it. Without one, both keep the hard-coded destination they have always
   * had, so no unrelated screen changes behaviour. */
  readonly returnRoute = signal<string | null>(null);

  ngOnInit(): void {
    const reason = this.route.snapshot.queryParamMap.get("reason");
    const mapped = reason && REASON_QUERY_PARAM_MAP[reason.toLowerCase()];
    if (mapped) this.changeTab(mapped);
    // The seeded hand-off, read alongside the existing `?reason=` read and read-and-CLEARED in
    // the same call - so the next unrelated visit to this form cannot inherit a stale
    // selection, whichever way the operator leaves this one.
    //
    // Only the SPARES are seeded. Equipment Name and Equipment Nomenclature are deliberately
    // left for the operator: a queue row carries an `equipment_class`, while this form's
    // nomenclature is an `SFD.ShipEquipment` reached from an equipment code, so there is no
    // honest join from one to the other. One DART is raised against one equipment and only the
    // operator knows which.
    //
    // Seeding the spares is unaffected by `loadMasterData()`'s timing, because the spares grid
    // is independent of the master data - which is the other reason nothing that depends on it
    // is seeded here.
    const seed = this.seedStore.consume();
    if (seed) {
      this.selectedSpares.set(seed.spares);
      this.returnRoute.set(seed.originRoute);
    }
  }
  currentFormType: 'defect' | 'guarantee' | 'aber' | null = null;
  currentSpareSource = signal<SpareSource>('defect');
  showSpareModal = signal(false);
  selectedSpares = signal<SpareItem[]>([]);
  showFormConfirmModal = signal(false);
  @ViewChild(AaAberForm)
  aberForm!: AaAberForm;
  @ViewChild(DefactForm)
  defectForm!: DefactForm;
  @ViewChild(GuaranteeDefectForm)
  guaranteeForm!: GuaranteeDefectForm;

  showPreview = signal(false);
  previewImages = signal<string[]>([]);
  openFormConfirmModal(type: 'defect' | 'guarantee' | 'aber') {
    this.currentFormType = type;
    this.showFormConfirmModal.set(true);
  }

  openPreview(images: string[]) {
    this.previewImages.set(images);
    this.showPreview.set(true);
  }

  closePreview() {
    this.showPreview.set(false);
    this.previewImages.set([]);
  }

  // on tab chagne
  changeTab(tab: "defect" | "guarantee-defect" | "A&A/ABES") {
    if (this.activeTab !== tab) {
      this.selectedSpares.set([]);
      this.showSpareModal.set(false);
    }

    this.activeTab = tab;
  }

  async onModalSave(data: ConfirmModalData) {

    this.closeFormConfirmModal();

    if (this.currentFormType === 'defect') {
      await this.defectForm.submit(data);
    }

    if (this.currentFormType === 'guarantee') {
      await this.guaranteeForm.submit(data);
    }

    if (this.currentFormType === 'aber') {
      await this.aberForm.submit(data);
    }
  }


  closeFormConfirmModal() {
    this.showFormConfirmModal.set(false);
  }
  openSpareModal(source: SpareSource) {
    this.currentSpareSource.set(source);
    this.showSpareModal.set(true);
  }

  closeSpareModal() {
    this.showSpareModal.set(false);
  }



  onSparesSelected(rows: SpareItem[]) {
    // The modal is seeded with `selectedSpares` when it opens and lets the user add to
    // AND remove from that same set, so what it emits back is the new complete
    // selection — not just newly-added rows. Merging (add-only) meant unchecking an
    // already-selected row in the modal had no effect here, since the merge never
    // removes anything.
    this.selectedSpares.set(rows);

    this.showSpareModal.set(false);
  }

  // Abandoning a seeded form returns the operator to the queue they came from, with nothing
  // changed and no DART number consumed - seeding writes nothing anywhere, and the store was
  // already emptied when it was read. Without an origin this is the same single line it has
  // always been, so the Back button on an ordinary maintainer's DART is unchanged.
  goBackToList() {
    const origin = this.returnRoute();
    this.router.navigateByUrl(origin ?? '/afterAuth/op-maintenance/defect/actions');
  }

  removeSpare(pk: string) {
    this.selectedSpares.update((rows) =>
      rows.filter((x: SpareItem) => String(x.pk ?? '') !== pk),
    );
  }
}
