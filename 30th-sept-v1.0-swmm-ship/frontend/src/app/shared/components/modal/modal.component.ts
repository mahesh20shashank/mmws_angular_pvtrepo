import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Output, Input, CUSTOM_ELEMENTS_SCHEMA, ChangeDetectionStrategy } from '@angular/core';
import { IconComponent } from '../icon/icon.component';


@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [IconComponent, ButtonComponent],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  templateUrl: './modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ['./modal.component.scss']
})
export class ModalComponent {
  /**
   * Size variant for the modal width. Accepts 'sm', 'md', or 'lg'. Defaults to 'md'.
   */
  @Input() size: 'sm' | 'md' | 'lg' | 'xl' = 'md';
  @Input() customBg = '';
  /** Set true to let content (e.g. a logo positioned above the card) overflow the
   *  card bounds instead of being clipped. Defaults to false to preserve rounded
   *  corner clipping for existing usages. */
  @Input() allowOverflow = false;
  /** Optional colored title bar spanning the modal's full width, with a built-in close
   *  button. Omit to keep the plain padded card every existing usage already relies on. */
  @Input() title = '';
  @Input() titleBg = '#1D96E9';
  /** Tighter body padding (16px vs the default 24/32px) for dense forms. Defaults to
   *  false so every existing usage keeps its current spacing unchanged — opt in per
   *  call site instead of changing the shared default. */
  @Input() compact = false;

  /**
   * Emits when the modal should be closed. Parent components can listen to this event
   * to hide the modal or perform any cleanup.
   */
  @Output() closeModal = new EventEmitter<void>();

  /**
   * Handles clicks on the backdrop. If the click originates from the backdrop element
   * (i.e., not from any child element), the modal will emit the close event.
   */
  // backdropClick(event: MouseEvent): void {
  //   // The event target will be the element that was clicked. The currentTarget is the
  //   // element that has the listener attached (the backdrop div). When they are the same,
  //   // the click happened directly on the backdrop, not on a child, so we close.
  //   if (event.target === event.currentTarget) {
  //     this.close.emit();
  //   }
  // }
}
