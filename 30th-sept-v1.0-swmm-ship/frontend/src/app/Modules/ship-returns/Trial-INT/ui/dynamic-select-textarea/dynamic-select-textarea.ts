import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-dynamic-select-textarea',
  standalone: true,
  templateUrl: './dynamic-select-textarea.html',
  styleUrl: './dynamic-select-textarea.css',
  imports:[CommonModule, FormsModule, ReactiveFormsModule]
})
export class DynamicSelectTextarea {
 @Input() form!: FormGroup;
  @Input() selectControl!: string;
  @Input() textareaControl!: string;
  @Input() triggerValue: string = 'SAT_OBS';
  @Input() options: { label: string; value: string }[] = [];
}

