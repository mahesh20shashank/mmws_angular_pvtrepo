import { Directive, EventEmitter, Output, Input } from '@angular/core';

/**
 * Abstract base class providing common modal functionality.
 * All modal content components (e.g., ShipModalComponent, LoginModalComponent)
 * extend this class to inherit a `close` output, a `size` input, and the `onClose`
 * helper method. This removes duplicated code and follows the DRY principle.
 */
@Directive()
export abstract class BaseModalComponent {
  /** Size variant for the modal width. Accepts 'sm', 'md', or 'lg'. Defaults to 'md'. */
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  /** Emits when the modal should be closed. */
  @Output() closeModal = new EventEmitter<void>();

  /** Helper to emit the close event from the template or component logic. */
  onClose(): void {
    this.closeModal.emit();
  }
}
