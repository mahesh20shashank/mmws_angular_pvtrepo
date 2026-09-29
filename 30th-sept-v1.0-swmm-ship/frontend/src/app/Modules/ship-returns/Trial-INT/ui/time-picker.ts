import { Component, forwardRef, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-time-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
 <div class="group flex w-full flex-col gap-1.5">
  <div
       class="relative flex h-[45px] w-full items-center rounded-[10px] border border-white/40 bg-white/[0.08] px-4 text-white transition focus-within:border-white/70"
      [class.opacity-60]="disabled"
      [class.pointer-events-none]="disabled">
    <label *ngIf="label" class="pointer-events-none absolute left-4 top-[3px] text-[11px] text-white/65">
      {{ label }}
      <span *ngIf="required" class="text-red-500">*</span>
    </label>

  <div class="flex w-full items-center gap-1 pt-3">
    <select
      [disabled]="disabled"
      [(ngModel)]="hour"
      (change)="updateTime()"
      (blur)="markTouched()"
      aria-label="Hour"
       class="min-w-0 flex-1 bg-transparent text-sm text-white outline-none">
       <option [ngValue]="null" class="bg-[#0d2438] text-white">HH</option>
       <option *ngFor="let h of hours" [ngValue]="h" class="bg-[#0d2438] text-white">
        {{ pad(h) }}
      </option>
    </select>

     <span class="text-white/50" aria-hidden="true">:</span>

    <select
      [disabled]="disabled"
      [(ngModel)]="minute"
      (change)="updateTime()"
      (blur)="markTouched()"
      aria-label="Minute"
       class="min-w-0 flex-1 bg-transparent text-sm text-white outline-none">
       <option [ngValue]="null" class="bg-[#0d2438] text-white">MM</option>
       <option *ngFor="let m of minutes" [ngValue]="m" class="bg-[#0d2438] text-white">
        {{ pad(m) }}
      </option>
    </select>

     <span class="text-white/50" aria-hidden="true">:</span>

    <select
      [disabled]="disabled"
      [(ngModel)]="second"
      (change)="updateTime()"
      (blur)="markTouched()"
      aria-label="Second"
       class="min-w-0 flex-1 bg-transparent text-sm text-white outline-none">
       <option [ngValue]="null" class="bg-[#0d2438] text-white">SS</option>
       <option *ngFor="let s of seconds" [ngValue]="s" class="bg-[#0d2438] text-white">
        {{ pad(s) }}
      </option>
    </select>
  </div>
  </div>

</div>
  `,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TimePickerComponent),
      multi: true,
    },
  ],
})
export class TimePickerComponent implements ControlValueAccessor {
  @Input() label = '';
  @Input() required = false;
  hours = Array.from({ length: 24 }, (_, i) => i);
  minutes = Array.from({ length: 60 }, (_, i) => i);
  seconds = Array.from({ length: 60 }, (_, i) => i);

  hour: number | null = null;
  minute: number | null = null;
  second: number | null = null;

  disabled = false;

  private onChange = (value: any) => {};
  private onTouched = () => {};

  writeValue(value: string | null): void {
    if (!value) {
      this.hour = null;
      this.minute = null;
      this.second = null;
      return;
    }

    const [h, m, s] = value.split(':').map(Number);
    this.hour = this.isValidPart(h, 23) ? h : null;
    this.minute = this.isValidPart(m, 59) ? m : null;
    this.second = this.isValidPart(s, 59) ? s : null;
  }

  registerOnChange(fn: any): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.onTouched = fn;
  }

  markTouched(): void {
    this.onTouched();
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  updateTime(): void {
    if (this.hour === null || this.minute === null || this.second === null)
      return;

    const time =
      this.pad(this.hour) +
      ':' +
      this.pad(this.minute) +
      ':' +
      this.pad(this.second);

    this.onChange(time);
    this.onTouched();
  }

  pad(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private isValidPart(value: number, max: number): boolean {
    return Number.isInteger(value) && value >= 0 && value <= max;
  }
}
