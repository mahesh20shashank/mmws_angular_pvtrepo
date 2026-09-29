import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Output, ChangeDetectionStrategy } from "@angular/core";
import { ModalComponent } from "../modal/modal.component";
import { IconComponent } from "../icon/icon.component";

/** Shared "Are you sure?" delete confirmation, usable by any module's table/list delete
 *  action. Self-contained (its own scoped CSS, no dependency on a caller's local button
 *  classes) so it renders identically regardless of which page imports it. The caller
 *  keeps its own pending-row signal and only calls its own delete method from `confirmed`
 *  — this component never deletes anything itself. */
@Component({
  selector: "app-confirm-delete-modal",
  standalone: true,
  imports: [ModalComponent, IconComponent, ButtonComponent],
  templateUrl: "./confirm-delete-modal.html",
  styleUrl: "./confirm-delete-modal.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDeleteModal {
  @Output() confirmed = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();
}
