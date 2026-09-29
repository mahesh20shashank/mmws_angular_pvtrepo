import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { DlApiService } from '../services/dl-api.service';
import { FileInput } from '../../../shared/components';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { HelpGuidance } from '../../../shared/components/help-guidance/help-guidance';

@Component({ selector: 'app-dl-import', standalone: true, imports: [CommonModule, ReactiveFormsModule, FileInput, IconComponent, HelpGuidance, ButtonComponent], templateUrl: './import.component.html', styleUrl: './import.component.css' })
export class ImportComponent {
  readonly helpHtml = `<p class="fw-bold mb-3">Import Defect List data - select the DL Type and the Excel file (*.xlsx), then click Import.</p>`;

  private readonly fb = inject(FormBuilder);
  private readonly api = inject(DlApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  busy = false; message = '';
  readonly types = ['AWRF II', 'AWRF I', 'DL1', 'DL2', 'DL3', 'SDL'];
  form = this.fb.group({ dl_type: this.fb.nonNullable.control('', Validators.required), excel: this.fb.control<File | null>(null, Validators.required) });
  reset(): void { this.form.reset({ dl_type: '', excel: null }); this.message = ''; this.cdr.markForCheck(); }
  submit(): void {
    const file = this.form.controls.excel.value;
    if (this.form.invalid || !file) { this.form.markAllAsTouched(); return; }
    const body = new FormData(); body.append('dl_type', this.form.controls.dl_type.value); body.append('excel', file);
    this.busy = true;
    this.message = '';
    this.cdr.markForCheck();
    this.api.importExcel(body).pipe(
      finalize(() => {
        this.busy = false;
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      })
    ).subscribe({
      next: r => {
        this.form.reset({ dl_type: '', excel: null });
        this.message = r.message ?? 'Import successful.';
        this.cdr.markForCheck();
      },
      error: e => {
        this.busy = false;
        this.message = e.error?.message ?? 'Import fail.';
        this.cdr.markForCheck();
        this.cdr.detectChanges();
      }
    });
  }
}
