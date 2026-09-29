import { ButtonComponent } from '../button/button.component';
import { Component, EventEmitter, Input, Output, HostListener, ChangeDetectionStrategy } from '@angular/core';


@Component({
  selector: 'app-image-preview',
  standalone: true,
  templateUrl: './image-preview.html',
  styleUrl: './image-preview.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonComponent],
})
export class ImagePreview {
  @Input() images: string[] = [];
  @Input() visible = false;

  @Output() closed = new EventEmitter<void>();

  activeImage = 0;

  close() {
    this.closed.emit();
  }

  @HostListener('document:keydown.escape')
  onEsc() {
    this.close();
  }
}
