import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  ReactiveFormsModule,
} from '@angular/forms';

import { CommonModule } from '@angular/common';

import { FormCardDialogComponent } from '../form-card-dialog/form-card-dialog.component';

import { InputComponent } from '../input.component';

import { SelectComponent } from '../select.component';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-duct-calculator-dialog',
  templateUrl: './duct-calculator-dialog.component.html',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormCardDialogComponent,
    InputComponent,
    SelectComponent
  ],
})
export class DuctCalculatorDialogComponent
  implements OnInit, OnChanges
{
  @Input() rowData: any;

  @Input() open = false;

  @Input() step: string | number = '';

  @Output() close = new EventEmitter<void>();

  @Output() save = new EventEmitter<any>();

  form!: FormGroup;

  ductTypeOptions = [
    { label: 'Square', value: 'Square' },
    { label: 'Rectangular', value: 'Rectangular' },
    { label: 'Circle', value: 'Circle' },
  ];

  constructor(private fb: FormBuilder ,  private toastService: ToastService) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.initializeForm();
    }
  }

  initializeForm(): void {
    const existingDucts = this.rowData?.calCulatedDetails || [];

    this.form = this.fb.group({
      noOfDucts: [
        existingDucts.length || this.rowData?.noOfDucts || 1,
        [Validators.required, Validators.min(1)],
      ],

      table: this.rowData?.table,

      ducts: this.fb.array([]),
    });

    this.generateDucts(
      this.form.get('noOfDucts')?.value,
      existingDucts
    );

    this.form.get('noOfDucts')?.valueChanges.subscribe((count) => {
      this.generateDucts(count, existingDucts);
    });
  }

  get ducts(): FormArray {
    return this.form.get('ducts') as FormArray;
  }

  createDuctGroup(
    existing: any = {},
    index: number
  ): FormGroup {

    const group = this.fb.group({

      ductType: [
        existing?.ductType || 'Square',
        Validators.required,
      ],

      // square
      side: [existing?.side || ''],

      // circle
      radius: [existing?.radius || ''],

      // rectangle
      length: [existing?.length || ''],

      width: [existing?.width || ''],

      // calculated
      ductArea: [
        {
          value: existing?.ductArea || '',
          disabled: true,
        },
      ],

      airFlow: [
        existing?.airFlow || '',
        Validators.required,
      ],

      flowRate: [
        {
          value: existing?.flowRate || '',
          disabled: true,
        },
      ],

      rowId: this.rowData?.s_no,

      duct_no:
        existing?.duct_no ||
        `D_${this.rowData?.table}${this.rowData?.s_no}_${index + 1}`,
    });

    // AUTO CALCULATIONS

    group.valueChanges.subscribe(() => {
      this.calculateDuctArea(group);
    });

    // CLEAR UNUSED FIELDS

    group.get('ductType')?.valueChanges.subscribe((type) => {

  // CLEAR ALL VALIDATORS FIRST

  group.get('side')?.clearValidators();
  group.get('radius')?.clearValidators();
  group.get('length')?.clearValidators();
  group.get('width')?.clearValidators();

  // SQUARE

  if (type === 'Square') {

    group.patchValue(
      {
        radius: '',
        length: '',
        width: '',
      },
      { emitEvent: false }
    );

    group.get('side')?.setValidators([
      Validators.required,
    ]);
  }

  // CIRCLE

  else if (type === 'Circle') {

    group.patchValue(
      {
        side: '',
        length: '',
        width: '',
      },
      { emitEvent: false }
    );

    group.get('radius')?.setValidators([
      Validators.required,
    ]);
  }

  // RECTANGLE

  else if (type === 'Rectangular') {

    group.patchValue(
      {
        side: '',
        radius: '',
      },
      { emitEvent: false }
    );

    group.get('length')?.setValidators([
      Validators.required,
    ]);

    group.get('width')?.setValidators([
      Validators.required,
    ]);
  }

  // UPDATE VALIDITY

  group.get('side')?.updateValueAndValidity({
    emitEvent: false,
  });

  group.get('radius')?.updateValueAndValidity({
    emitEvent: false,
  });

  group.get('length')?.updateValueAndValidity({
    emitEvent: false,
  });

  group.get('width')?.updateValueAndValidity({
    emitEvent: false,
  });

  this.calculateDuctArea(group);
});

    return group;
  }

  generateDucts(
    count: number,
    existingDucts: any[] = []
  ): void {

    const currentLength = this.ducts.length;

    // ADD ROWS

    if (count > currentLength) {

      for (let i = currentLength; i < count; i++) {

        const existing = existingDucts[i];

        const group = this.createDuctGroup(
          existing,
          i
        );

        this.ducts.push(group);
      }
    }

    // REMOVE ROWS

    if (count < currentLength) {

      for (
        let i = currentLength - 1;
        i >= count;
        i--
      ) {
        this.ducts.removeAt(i);
      }
    }
  }

  calculateDuctArea(group: FormGroup): void {

    const ductType = group.get('ductType')?.value;

    let area = 0;

    // SQUARE

    if (ductType === 'Square') {

      const side = Number(
        group.get('side')?.value || 0
      );

      area = side * side;
    }

    // CIRCLE

    else if (ductType === 'Circle') {

      const radius = Number(
        group.get('radius')?.value || 0
      );

      area = Math.PI * radius * radius;
    }

    // RECTANGLE

    else if (ductType === 'Rectangular') {

      const length = Number(
        group.get('length')?.value || 0
      );

      const width = Number(
        group.get('width')?.value || 0
      );

      area = length * width;
    }

    group.get('ductArea')?.setValue(
      area ? area.toFixed(4) : '',
      { emitEvent: false }
    );

    this.calculateFlowRate(group);
  }

  calculateFlowRate(group: FormGroup): void {

    const ductArea = Number(
      group.get('ductArea')?.value || 0
    );

    const airFlow = Number(
      group.get('airFlow')?.value || 0
    );

    const result = ductArea * airFlow * 3600;

    group.get('flowRate')?.setValue(
      result ? result.toFixed(2) : '',
      { emitEvent: false }
    );
  }

  getTotalFlow(): number {

    return this.ducts.controls.reduce(
      (sum, ctrl) => {

        return (
          sum +
          Number(
            ctrl.get('flowRate')?.value || 0
          )
        );
      },
      0
    );
  }

  onSave(): void {

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toastService.showError('Please fill all the duct details');
      return;
    }

  const value = this.form.getRawValue();

  // GET UNIQUE DUCT TYPES

  const ductTypes = [
    ...new Set(
      value.ducts
        .map((duct: any) => duct.ductType)
        .filter((type: string) => !!type)
    ),
  ];

  const updatedData = {

    noOfDucts: value.noOfDucts,

    ductDetails: value.ducts,

    flowRateAtDucts:
      this.getTotalFlow().toFixed(2),

    rowId: this.rowData?.s_no,

    table: value.table,

    duct_type: ductTypes,
  };

  console.log('updatedData => ', updatedData);

  this.save.emit(updatedData);
  }

  onClose(): void {
    this.close.emit();
  }
}
