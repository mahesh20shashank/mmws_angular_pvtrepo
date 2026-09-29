import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  FormGroup
} from '@angular/forms';

import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AppService } from '../../../../Core/services/app/app.service';
import { NotificationService } from '../../../../Core/services/notification/notification.service';
import { DartHistoryRow } from '../history.component';

@Component({
  selector: 'app-view-action',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule
  , ButtonComponent],
  templateUrl: './view-action.component.html',
  styleUrl: './view-action.component.scss'
})
export class HistoryViewActionComponent implements OnInit {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private appService = inject(AppService);
  private toast = inject(NotificationService);

  private dartId: number | string | null = null;
  dartNo = '';
  defectDate = '';

  // `history.state` read inside ngOnInit can already be stale/undefined by the time
  // this lazy-loaded standalone component's constructor + change detection settle —
  // `getCurrentNavigation()` is only valid *during* the navigation that creates this
  // component, so capture it here instead of relying on ngOnInit's `history.state` read.
  private readonly navigationDartData = this.router.getCurrentNavigation()?.extras?.state?.['dartData'] as
    | DartHistoryRow
    | undefined;

  form: FormGroup;

  constructor() {

    this.form = this.fb.group({
      equipmentName: [''],
      nomenclature: [''],
      subDepartment: [''],
      department: [''],

      symptom: [''],
      severity: [''],
      maintenancePeriod: [''],
      occasion: [''],

      defectDescription: [''],
      shipRemarks: [''],

      closureDate: [''],
      repairAgency: [''],
      diagnosisCode: [''],
      daysDelayed: [''],

      delayReason: [''],
      lessonLearnt: ['']
    });

  }
  ngOnInit(): void {

  const dartData = this.navigationDartData ?? (history.state?.dartData as DartHistoryRow | undefined);

  if (!dartData) {
    this.toast.error('No DART details found — please open this page from the History list.');
    return;
  }

    this.dartId = dartData.id;
    this.dartNo = dartData.dartNo;
    this.defectDate = dartData.defectDate;

    this.form.patchValue({
      equipmentName: dartData.equipmentName,
      nomenclature: dartData.equipmentNomenclature,
      subDepartment: dartData.subDepartment,
      department: dartData.department,

      symptom: dartData.symptomCode,
      severity: dartData.severityCode,
      maintenancePeriod: dartData.maintenanceType,
      occasion: dartData.dartOccasion,

      defectDescription: dartData.defectDescription,
      shipRemarks: dartData.shipRemarks,

      closureDate: dartData.closureDate,
      repairAgency: dartData.repairAgency,
      diagnosisCode: dartData.diagnosisCode,
      daysDelayed: dartData.daysDelayed,

      delayReason: dartData.delayReason,
      lessonLearnt: dartData.lessonLearnt
    });
  }

  async downloadPdf(): Promise<void> {
    if (!this.dartId) {
      return;
    }

    try {
      const blob = await firstValueFrom(this.appService.getBlob(`api/v1/dart/history_pdf/${this.dartId}/`));
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch {
      this.toast.error('Failed to download PDF');
    }
  }

  goBack(): void {
   this.router.navigateByUrl('/afterAuth/op-maintenance/defect/history');
  }
}
