import { ButtonComponent } from '../../../../shared/components/button/button.component';
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  OnInit,
} from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";

import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { SelectInput, DropdownOption } from "../../../../shared/components/select-input/select-input";
import {
  CommonApiService,
  CreateTaginPayload,
  TaginFormMetaResponse,
  TagoutItem,
} from "../../../../Core/http/services/api.service";

const HELP_HTML = `<p class="mb-0">Record an equipment tag back in from an approved tag out. Select the tag out to load its isolation record, confirm whether all items were returned, and submit - unreturned items must be listed before you can submit.</p>`;

export interface TagoutSelectOption {
  id: number;
  label: string;
  item: TagoutItem;
}

@Component({
  selector: "app-create-tagin",
  standalone: true,
  imports: [CommonModule, FormsModule, IconComponent, HelpGuidance, SelectInput, ButtonComponent],
  templateUrl: "./create-tagin.component.html",
  styleUrl: "./create-tagin.component.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateTaginComponent implements OnInit {
  readonly helpHtml = HELP_HTML;
  private readonly router = inject(Router);
  private readonly commonApiService = inject(CommonApiService);

  // Form Signals
  readonly date = signal<string>(new Date().toISOString().slice(0, 10));
  readonly selectedTagoutId = signal<number | null>(null);
  readonly selectedTagout = signal<TagoutItem | null>(null);
  readonly taginDescription = signal<string>("");
  readonly maintainer = signal<string>("Cdr Hod ENG");
  readonly allItemsReturned = signal<boolean>(true);
  readonly itemsPending = signal<string>("");

  // State Signals
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Equipment Options Signal
  readonly shipEquipments = signal<{ id: number; nomenclature?: string; name?: string }[]>([]);
  readonly tagoutOptions = signal<TagoutSelectOption[]>([]);

  readonly formattedTagoutOptions = computed<DropdownOption[]>(() =>
    this.tagoutOptions().map((opt) => ({
      label: opt.label,
      value: opt.id,
    })),
  );

  ngOnInit(): void {
    this.loadTagoutOptions();
  }

  private loadTagoutOptions(): void {
    this.commonApiService.getTaginShipEquipments().subscribe({
      next: (equipRes) => {
        const rawList = Array.isArray(equipRes)
          ? equipRes
          : (equipRes?.ship_equipments || (equipRes as { equipments?: unknown[] })?.equipments || []);
        if (Array.isArray(rawList) && rawList.length > 0) {
          const equips = rawList as { id: number; nomenclature?: string; name?: string }[];
          this.shipEquipments.set(equips);
          this.populateOptionsFromEquipmentsOnly();
        }
        this.fetchTaginFormMeta();
      },
      error: (err) => {
        console.error("Error loading ship equipments from GET /api/v1/inout-tags/tagins/ship_equipments/:", err);
      },
    });
  }

  private fetchTaginFormMeta(): void {
    this.commonApiService.getTaginFormMeta().subscribe({
      next: (res: TagoutItem[] | TaginFormMetaResponse) => {
        const approved = Array.isArray(res) ? res : (res?.approved_tagouts || res?.tagouts);
        if (approved && Array.isArray(approved) && approved.length > 0) {
          this.enrichOptionsWithTagouts(approved);
        }
      },
      error: (err) => {
        console.error("Error fetching tagin form metadata:", err);
      },
    });
  }

  private getEquipmentIdFromTagout(tagout: TagoutItem): number {
    if (typeof tagout.tagout_equipment_name === "number") {
      return tagout.tagout_equipment_name;
    }
    const detail = (tagout as { tagout_equipment_name_detail?: { id?: number } }).tagout_equipment_name_detail;
    if (typeof detail === "object" && detail?.id) {
      return detail.id;
    }
    return tagout.id;
  }

  private enrichOptionsWithTagouts(tagouts: TagoutItem[]): void {
    const currentOptions = [...this.tagoutOptions()];
    const equips = this.shipEquipments();

    tagouts.forEach((tagout) => {
      const eqId = this.getEquipmentIdFromTagout(tagout);

      const matchedOptIndex = currentOptions.findIndex((opt) => opt.id === eqId || opt.id === tagout.id);
      const matchedEquip = equips.find((eq) => eq.id === eqId || eq.id === tagout.id);
      const equipName =
        matchedEquip?.nomenclature ||
        matchedEquip?.name ||
        tagout.name_of_component ||
        tagout.name_of_subsystem ||
        `Equipment #${tagout.id}`;
      const tagNum = tagout.tagout_number || `TAG-${tagout.id}`;
      const label = `${equipName} (${tagNum})`;

      if (matchedOptIndex !== -1) {
        currentOptions[matchedOptIndex] = {
          id: tagout.id,
          label,
          item: tagout,
        };
      } else {
        currentOptions.push({
          id: tagout.id,
          label,
          item: tagout,
        });
      }
    });

    this.tagoutOptions.set(currentOptions);
  }

  private populateOptionsFromEquipmentsOnly(): void {
    const equips = this.shipEquipments();
    if (equips && equips.length > 0) {
      const options: TagoutSelectOption[] = equips.map((eq) => {
        const name = eq.nomenclature || eq.name || `Equipment #${eq.id}`;
        return {
          id: eq.id,
          label: name,
          item: {
            id: eq.id,
            tagout_number: "",
            tagout_equipment_name: eq.id,
            name_of_component: name,
            name_of_subsystem: name,
            approval_status: "Approved",
            is_placeholder: true,
          } as TagoutItem & { is_placeholder?: boolean },
        };
      });
      this.tagoutOptions.set(options);
    }
  }

  onTagoutSelect(idValue: string | number | null | undefined): void {
    const numId = idValue ? Number(idValue) : 0;
    if (!numId) {
      this.selectedTagoutId.set(null);
      this.selectedTagout.set(null);
      return;
    }
    this.selectedTagoutId.set(numId);
    const found = this.tagoutOptions().find((opt) => opt.id === numId);
    if (found) {
      this.selectedTagout.set(found.item);
    } else {
      this.selectedTagout.set(null);
    }
  }

  getEquipmentDisplayName(item: TagoutItem | null): string {
    if (!item) return "-";
    const matchedEquip = this.shipEquipments().find(
      (eq) => eq.id === Number(item.tagout_equipment_name) || eq.id === item.id
    );
    return (
      matchedEquip?.nomenclature ||
      matchedEquip?.name ||
      item.name_of_component ||
      item.name_of_subsystem ||
      (typeof item.tagout_equipment_name === "string" ? item.tagout_equipment_name : "") ||
      `Equipment #${item.id}`
    );
  }

  clearTagoutSelection(): void {
    this.selectedTagoutId.set(null);
    this.selectedTagout.set(null);
  }

  onSubmit(): void {
    if (!this.selectedTagoutId()) {
      this.errorMessage.set("Please select a Tag Out Equipment.");
      return;
    }

    const selectedItem = this.selectedTagout();
    if (selectedItem) {
      if ((selectedItem as { is_placeholder?: boolean }).is_placeholder) {
        this.errorMessage.set(
          `Selected equipment (${selectedItem.name_of_component || 'Equipment #' + selectedItem.id}) does not have an approved TagOut record in the database yet. Please create and approve a TagOut for this equipment before creating a TagIn.`
        );
        return;
      }

      if (selectedItem.approval_status && selectedItem.approval_status.toLowerCase() !== "approved") {
        this.errorMessage.set(
          `Selected TagOut (${selectedItem.tagout_number || 'TAG-' + selectedItem.id}) is not approved yet. Please get the TagOut approved first before initiating TagIn.`
        );
        return;
      }

      if (selectedItem.has_tagin || selectedItem.has_tag_in || selectedItem.tagin) {
        this.errorMessage.set(
          `A TagIn already exists for ${selectedItem.tagout_number || 'this TagOut'}. You cannot create duplicate TagIns.`
        );
        return;
      }
    }

    if (!this.taginDescription().trim()) {
      this.errorMessage.set("Please enter Tag In Description.");
      return;
    }

    if (!this.allItemsReturned() && !this.itemsPending().trim()) {
      this.errorMessage.set("Please provide details for Items Pending.");
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const realTagoutId = selectedItem?.id ? Number(selectedItem.id) : Number(this.selectedTagoutId());

    const payload: CreateTaginPayload = {
      tagout: realTagoutId,
      tagin_date: this.date() || new Date().toISOString().slice(0, 10),
      tagin_description: this.taginDescription().trim(),
      tagin_maintainer: this.maintainer(),
      all_items_returned: this.allItemsReturned(),
      items_pending: this.allItemsReturned() ? null : this.itemsPending().trim(),
    };

    this.commonApiService.createTagin(payload).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.successMessage.set("TagIn submitted successfully!");
        setTimeout(() => {
          this.goBack();
        }, 1200);
      },
      error: (err: unknown) => {
        console.error("POST api/v1/inout-tags/tagins/ error:", err);
        this.isSubmitting.set(false);
        this.errorMessage.set(this.parseSubmitError(err));
      },
    });
  }

  private parseSubmitError(err: unknown): string {
    const errObj = err as { error?: unknown; message?: string; status?: number };
    let msg = "Failed to submit TagIn.";

    if (errObj?.error) {
      msg = this.extractFromErrorField(errObj.error);
    } else if (errObj?.message) {
      msg = errObj.message;
    }

    return this.refineErrorMessage(msg, errObj?.status);
  }

  private extractFromErrorField(errorData: unknown): string {
    if (typeof errorData === "string") {
      return errorData;
    }
    if (typeof errorData === "object" && errorData !== null) {
      return this.parseErrorObject(errorData as Record<string, unknown>);
    }
    return "Failed to submit TagIn.";
  }

  private parseErrorObject(errRecord: Record<string, unknown>): string {
    if ("isTrusted" in errRecord || (typeof ProgressEvent !== "undefined" && errRecord instanceof ProgressEvent)) {
      return "Unable to connect to the backend server. Please ensure the backend server is running.";
    }

    const errs: string[] = [];
    for (const [k, val] of Object.entries(errRecord)) {
      if (Array.isArray(val)) {
        errs.push(`${k}: ${val.join(", ")}`);
      } else if (typeof val === "string") {
        errs.push(`${k}: ${val}`);
      } else {
        errs.push(`${k}: ${JSON.stringify(val)}`);
      }
    }
    return errs.join(" | ") || "Server error occurred.";
  }

  private refineErrorMessage(msg: string, status?: number): string {
    if (msg.includes("isTrusted") || status === 0) {
      return "Unable to connect to the backend server. Please ensure the backend server is running.";
    }
    if (msg.includes("already exists") || msg.includes("already has a TagIn")) {
      return "A TagIn has already been submitted for this TagOut. You cannot create duplicate TagIns.";
    }
    if (msg.includes("TagOut not found or not approved") || msg.includes("Invalid pk") || msg.includes("does_not_exist")) {
      return "Selected TagOut is not approved or does not exist in the database. Please get the TagOut approved first before initiating TagIn.";
    }
    return msg;
  }

  goBack(): void {
    this.router.navigate(["/afterAuth/other-utilities/tag-in-tag-out/tag-in"]);
  }
}
