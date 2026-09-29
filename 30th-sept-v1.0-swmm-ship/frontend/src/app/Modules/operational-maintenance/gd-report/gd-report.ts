import { ButtonComponent } from '../../../shared/components/button/button.component';
import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MasterCard } from '../../refit-maintenance/master-card/master-card';
import { IconComponent } from '../../../shared/components/icon/icon.component';
import { OperationalMaintenanceApi } from '../services/operational-maintenance-api';

interface GuaranteeDefectDetailResponse {
  status: string;
  data: {
    dart_number: string;
    description: string;
    location: string;
    created_date: string;
    guarantee_cause: string;
    completion_date: string;
    op_availability: string;
    hot_work: string;
    repair_date: string;
    place: string;
  };
}

interface GuaranteeDefect {
  dart_number: string;
  description: string;
  location: string;
  date_of_occurrence: string;
  guarantee_cause: string;
  guarantee_completion_date: string;
  guarantee_op_availability: string;
  guarantee_hot_work: string;
  guarantee_repair_date: string;
  guarantee_place: string;
}

@Component({
  selector: 'app-gd-report',
  standalone: true,
  imports: [CommonModule, MasterCard, IconComponent, ButtonComponent],
  templateUrl: './gd-report.html',
})
export class GdReport implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly call = inject(OperationalMaintenanceApi);

  gd: GuaranteeDefect | null = null;
  loading = true;

  async ngOnInit(): Promise<void> {
    const dartId = Number(this.route.snapshot.queryParamMap.get('dart_id'));

    if (!dartId) {
      this.loading = false;
      return;
    }

    try {
      const res = await firstValueFrom(this.call.getDartDetails(dartId));
      const data = (res as GuaranteeDefectDetailResponse).data;
      this.gd = {
        dart_number: data.dart_number,
        description: data.description,
        location: data.location,
        date_of_occurrence: data.created_date,
        guarantee_cause: data.guarantee_cause,
        guarantee_completion_date: data.completion_date,
        guarantee_op_availability: data.op_availability,
        guarantee_hot_work: data.hot_work,
        guarantee_repair_date: data.repair_date,
        guarantee_place: data.place,
      };
    } catch (err) {
      console.error('Failed to load guarantee defect details', err);
    } finally {
      this.loading = false;
    }
  }

  print(): void {
    window.print();
  }
}
