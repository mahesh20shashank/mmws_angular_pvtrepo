import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  Output,
  EventEmitter,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reusable-delete-dialog-dynamic-content',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reusable-delete-dialog-dynamic-content.html',
  styleUrl: './reusable-delete-dialog-dynamic-content.css',
})
export class ReusableDeleteDialogDynamicContent implements OnChanges, AfterViewInit {
  @Input() open = false;
  @Input() title = 'Confirm Delete';
  @Input() message = 'Are you sure you want to delete?';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<void>();

  @ViewChild('portalRoot') portalRoot?: ElementRef<HTMLElement>;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']?.currentValue === true) {
      setTimeout(() => this.mountToBody(), 0);
    }
  }

  ngAfterViewInit(): void {
    if (this.open) {
      setTimeout(() => this.mountToBody(), 0);
    }
  }

  onClose(): void {
    this.close.emit();
  }

  onConfirm(): void {
    this.confirm.emit();
  }

  /** Escape backdrop-filter / overflow ancestors from parent layout. */
  private mountToBody(): void {
    const el = this.portalRoot?.nativeElement;
    if (!el || el.parentElement === document.body) {
      return;
    }
    document.body.appendChild(el);
  }
}
