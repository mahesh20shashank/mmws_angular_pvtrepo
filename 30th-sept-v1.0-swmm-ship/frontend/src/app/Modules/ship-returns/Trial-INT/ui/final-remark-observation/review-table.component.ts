import { ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit, SimpleChanges, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { QRCodeComponent } from 'angularx-qrcode';
// import { ApiService } from './api.service';
// import { FileUploadComponent } from '../ui/file-upload/file-upload.component';

import { FormApiService } from '../../angulerFromconverting/form-api.service';
import { Subscription } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { ApiService } from '../../api.service';
import { FileUploadComponent } from '../file-upload/file-upload.component';
import { TextareaComponent } from '../textarea';

interface SignatureProfile {
  first_name?: string;
  last_name?: string;
  unit_name?: string;
  timestamp?: string;
}

interface RemarkRow {
  childNote: string;
  isSigned: boolean;
  userDetailseData: SignatureProfile | null;
  qrSignatureData: string;
}

interface ObservationRow {
  observation: string;
  fileName: string | null;
  isExpanded: boolean;
  remarks: RemarkRow[];
}

@Component({
  selector: 'app-review-table',
  standalone: true,
  imports: [CommonModule, FormsModule, QRCodeComponent, FileUploadComponent, TextareaComponent],
  templateUrl: './review-table.component.html',
  styleUrl: './review-table.component.css',
})
export class ReviewTableComponent implements OnInit, OnChanges, OnDestroy {
  readonly maxRows = 20;
  readonly maxRating = 10;
  readonly ratingSteps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  @Input() isReoffer = true;
  @Input() equipmentId: string | number | null = null;
  data: any = [];
  rating = 0;
  hoverRating = 0;
  private readonly subscriptions = new Subscription();
  private initialized = false;
  private lastObservationKey = '';
  private readonly apiService = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly formApiService = inject(FormApiService);
  private readonly route = inject(ActivatedRoute);

  constructor() {
   this.addRow();
  }

  ngOnInit(): void {
    this.initialized = true;
    this.getObservationData();
    this.subscriptions.add(
      this.formApiService.formSubmit$.subscribe(() => this.submit()),
    );
    this.subscriptions.add(
      this.formApiService.equipmentChange$.subscribe((equipment) => {
        this.equipmentId = this.resolveEquipmentId(equipment);
        this.getObservationData();
      }),
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['equipmentId'] && !changes['equipmentId'].firstChange && this.initialized) {
      this.getObservationData();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  getObservationData(): void {
    const trial =  this.formApiService?.context?.uuid || this.route.snapshot.queryParams['trial'];
    const equipment = this.selectedEquipmentId;
    if (!trial) return;

    const observationKey = `${trial}:${equipment ?? ''}`;
    if (observationKey === this.lastObservationKey) return;
    this.lastObservationKey = observationKey;

    this.data = [];
    this.rating = 0;
    this.hoverRating = 0;

    this.apiService
      .get('/api/data/final-observation/', { trial, equipment })
      .subscribe((res: any) => {
        const data = res?.data?.[0];
        if (res?.data?.length > 0) {
          this.data = data?.observation?.rows ?? [];
          this.rating = data?.observation?.rating ?? 0;
        } else {
          this.data = [this.createEmptyRow()];
        }
        this.cdr.markForCheck();
      });
  }

  addRow(): void {
    if (this.data.length >= this.maxRows) return;
    this.data.push(this.createEmptyRow());
  }

  deleteRow(index: number): void {
    if (this.data.length <= 1) return;
    this.data.splice(index, 1);
  }

  saveRow(row: ObservationRow, index: number): void {
    console.log('Saving row:', index, row);
  }

  toggleParent(row: ObservationRow): void {
    row.isExpanded = !row.isExpanded;
    if (row.isExpanded && row.remarks.length === 0) {
      this.addChildRemark(row);
    }
  }

  addChildRemark(row: ObservationRow): void {
    row.remarks.push(this.createEmptyRemark());
  }

  removeChildRemark(row: ObservationRow, index: number): void {
    row.remarks.splice(index, 1);
  }

  signRemark(remark: RemarkRow): void {
    if (!remark.isSigned) {
      this.apiService.get('api/auth/digital-signature-profile').subscribe((res: any) => {
        const profile = res?.data as SignatureProfile | undefined;
        remark.userDetailseData = profile ?? null;
        remark.qrSignatureData = `Signed By: ${profile?.first_name} ${profile?.last_name}\nUnit: ${profile?.unit_name}\nTime: ${profile?.timestamp}`;
        remark.isSigned = true;
        this.cdr.markForCheck();
      });
      return;
    }

    remark.isSigned = false;
    remark.userDetailseData = null;
    remark.qrSignatureData = '';
  }

  setRating(value: number): void {
    this.rating = value;
  }

  setHoverRating(value: number | null): void {
    this.hoverRating = value ?? 0;
  }

  isStarActive(star: number): boolean {
    return star <= (this.hoverRating || this.rating);
  }

  submit(): void {

    const payload = {

        "trial": this.formApiService?.context?.uuid,
        "equipment": this.selectedEquipmentId,
        "ob_type": this.formApiService?.context?.ob_type_id,
        "re_offer_status": 1,
        "observation": { rating: this.rating,  rows: this.data  }
     }
    this.apiService.post('/api/data/final-observation/',payload).subscribe((res: any) => {
      console.log('Response:', res);
    });
  }

  private get selectedEquipmentId(): number | null {
    return this.equipmentId ?? this.formApiService?.currentEquipmentNomenclature?.id ?? null;
  }

  private resolveEquipmentId(equipment: any): number | null {
    return equipment?.id ?? null;
  }

  private createEmptyRow(): ObservationRow {
    return {
      observation: '',
      fileName: null,
      isExpanded: false,
      remarks: [],
    };
  }

  private createEmptyRemark(): RemarkRow {
    return {
      childNote: '',
      isSigned: false,
      userDetailseData: null,
      qrSignatureData: '',
    };
  }
}
