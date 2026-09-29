import {
  Component,
  Input,
  Output,
  EventEmitter,
  HostListener,
  ContentChild,
  AfterContentInit,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-form-card-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './form-card-dialog.component.html',
  styleUrl: './form-card-dialog.component.css',
})
export class FormCardDialogComponent implements AfterContentInit {
  @Input() open: boolean = false;
  @Input() loading = false;
  isExpanded = false;
  // Header
  @Input() title = '';
  @Input() subtitle = '';

  // Footer labels
  @Input() submitLabel = 'Submit';
  @Input() cancelLabel = 'Cancel';

  // Footer visibility
  @Input() showFooter = true;

  // Detect custom footer
  @ContentChild('[formFooter]', { static: false })
  customFooter!: ElementRef;

  hasCustomFooter = false;

  @Output() close = new EventEmitter<void>();
  @Output() submit = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  ngAfterContentInit() {
    this.hasCustomFooter = !!this.customFooter;
  }

  onClose() {
    if (!this.loading) {
      this.close.emit();
    }
  }

  onSubmit() {
    if (!this.loading) {
      this.submit.emit();
    }
  }

  onCancel() {
    if (!this.loading) {
      this.cancel.emit();
      this.close.emit();  // optional
    }
  }
  toggleExpand() {
    this.isExpanded = !this.isExpanded;
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.open) {
      this.onClose();
    }
  }
}
