import { CommonModule } from '@angular/common';
import {
  ChangeDetectorRef,
  Component,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
} from '@angular/core';
import { FormGroup, FormBuilder, FormArray, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-dynamic-textarea',
  standalone: true,
  imports:[CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dynamic-textarea.html',
  styleUrl: './dynamic-textarea.css',
})
export class DynamicTextarea implements OnChanges, OnDestroy {

  @Input() form!: FormGroup;
  @Input() controlName!: string;
  @Input() placeholder: string = 'Enter details';

  private valueChangesSubscription?: Subscription;

  constructor(
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['form'] || changes['controlName']) {
      this.valueChangesSubscription?.unsubscribe();
      this.valueChangesSubscription = this.form
        ?.get(this.controlName)
        ?.valueChanges.subscribe(() => this.cdr.markForCheck());
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.valueChangesSubscription?.unsubscribe();
  }



  get items(): FormArray {
  return (this.form.get(this.controlName) as FormArray) || this.fb.array([]);
}
  addItem() {
    this.items.push(this.fb.control(''));
  }

  removeItem(index: number) {
    this.items.removeAt(index);
  }
}
