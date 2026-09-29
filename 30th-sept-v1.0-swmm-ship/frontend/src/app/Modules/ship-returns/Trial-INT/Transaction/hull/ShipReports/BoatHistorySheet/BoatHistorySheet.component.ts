// boat-history-sheet-report.component.ts

import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute } from '@angular/router';

import { ApiService } from '../../../../api.service';
import { Apiendpoints } from '../../../../ApiEndPoints';

@Component({
  selector: 'app-boat-history-sheet-report',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './BoatHistorySheet.component.html',
  styleUrls: ['../report.module.css'],
})
export class BoatHistorySheetReportComponent implements OnInit {
  rowId!: string;

  /* HEADER */
  shipName = '';
  boatRegistrationNumber = '';
  typeOfBoat = '';
  engineOem = '';
  boatBuilder = '';
  yearOfBuilt = '';
  dateOfSupplyToShip = '';
  unit = '';
  yearOfRenderingBhs = '';
  berAber = '';
  occasionOfRenderingBhs = '';
  conditionOfHull = '';
  conditionOfFittings = '';
  conditionOfDavit = '';
  statusOfIntegratedNav = '';
  maxSpeedCurrent = '';
  maxRpmCurrent = '';
  maxSpeedPdi = '';
  maxRpmPdi = '';
  remedialActionSpeedDrop = '';
  weighingUndertakenOn = '';
  weighingLocation = '';
  observedWeight = '';
  pdiTrialWeight = '';
  remedialActionWeightIncrease = '';
  majorRepairs = '';
  dueDateChangeOfCollar = '';
  imoCertificateValidity = '';
  draftStatus = '';
  documentUrl = '';

  reportData: any = {};

  formatStatus(statusVal: any): string {
    if (!statusVal) return '-';
    const s = statusVal.toString().toLowerCase().trim();
    if (s === 'draft' || s === 'initiate' || s === 'initiated') return 'Draft';
    if (
      s === 'work in progress' ||
      s === 'work_in_progress' ||
      s === 'save' ||
      s === 'pending' ||
      s === 'in progress'
    )
      return 'Pending';
    if (s === 'approved' || s === 'complete') return 'Complete';
    return statusVal;
  }

  get reportStatus(): string {
    return this.formatStatus(this.draftStatus);
  }

  reportTableData: any[] = [];
  engineTableData: any[] = [];

  constructor(
    private apiService: ApiService,
    private route: ActivatedRoute,
    private cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    this.rowId = this.route.snapshot.paramMap.get('id') || '';

    if (this.rowId) {
      this.getReportData(this.rowId);
    }
  }

  getReportData(id: string): void {
    this.apiService
      .get(`${Apiendpoints.BOAT_HISTORY_SHEET}${id}/`)
      .subscribe({
        next: (res: any) => {
          if (res?.data) {
            const data = res.data;

            this.shipName = data?.ship_name || data?.ship?.name || '-';

            this.boatRegistrationNumber =
              data?.bhs_reg_no?.oem_reg_no ||
              data?.bhs_reg_no?.name ||
              data?.bhs_reg_no ||
              '-';

            this.typeOfBoat =
              data?.bhs_type_of_boat ||
              data?.bhs_reg_no?.type_of_boat ||
              '-';

            this.engineOem =
              data?.bhs_engine_oem ||
              data?.bhs_reg_no?.engine_oem ||
              '-';

            this.boatBuilder =
              data?.bhs_boat_builder ||
              data?.bhs_reg_no?.boat_builder ||
              '-';

            this.yearOfBuilt =
              data?.bhs_built_year ||
              data?.bhs_reg_no?.built_year ||
              '-';

            this.dateOfSupplyToShip = data?.bhs_date_of_supply
              ? new Date(data.bhs_date_of_supply).toLocaleDateString('en-GB')
              : '-';

            this.unit = data?.bhs_unit || data?.unit || '-';

            this.yearOfRenderingBhs = data?.bhs_year_of_rendering || '-';

            this.berAber = data?.bhs_ber_aber || '-';

            this.occasionOfRenderingBhs = data?.bhs_occ_of_rendering || '-';

            this.conditionOfHull = data?.bhs_cond_of_hull || '-';

            this.conditionOfFittings = data?.bhs_cond_of_fittings || '-';

            this.conditionOfDavit = data?.bhs_cond_of_davit_lifting || '-';

            this.statusOfIntegratedNav =
              data?.status_of_integrated_navigation || '-';

            this.maxSpeedCurrent =
              data?.max_speed_during_current_trails || '-';

            this.maxRpmCurrent = data?.max_rpm_during_current_trails || '-';

            this.maxSpeedPdi =
              data?.max_speed_during_pdi_speed_trails || '-';

            this.maxRpmPdi = data?.max_rpm_during_pdi_speed_trails || '-';

            this.remedialActionSpeedDrop = data?.remedial_action_taken || '-';

            this.weighingUndertakenOn = data?.weighing_undertaken_on
              ? new Date(data.weighing_undertaken_on).toLocaleDateString(
                  'en-GB',
                )
              : '-';

            this.weighingLocation = data?.weighing_location || '-';

            this.observedWeight = data?.observed_weight || '-';

            this.pdiTrialWeight = data?.pdi_trial_weight || '-';

            this.remedialActionWeightIncrease =
              data?.weight_remedial_action_taken || '-';

            this.majorRepairs = data?.major_repairs_since_last_return || '-';

            this.dueDateChangeOfCollar = data?.due_date_change_of_collar
              ? new Date(data.due_date_change_of_collar).toLocaleDateString(
                  'en-GB',
                )
              : '-';

            this.imoCertificateValidity = data?.imo_certificate_validity
              ? new Date(data.imo_certificate_validity).toLocaleDateString(
                  'en-GB',
                )
              : '-';

            this.draftStatus = data?.draft_status || data?.status || '';

            this.documentUrl =
              data?.document ||
              data?.document_url ||
              data?.file_url ||
              data?.reference_document ||
              '';

            this.reportData = {
              ...data,
              shipName: this.shipName,
              oem_reg_no: this.boatRegistrationNumber,
              type_of_boat: this.typeOfBoat,
              engine_oem: this.engineOem,
              boat_builder: this.boatBuilder,
              built_year: this.yearOfBuilt,
              date_of_supply_to_ship: this.dateOfSupplyToShip,
              unit: this.unit,
              year_of_rendering: this.yearOfRenderingBhs,
              ber_aber: this.berAber,
              occ_of_rendering: this.occasionOfRenderingBhs,
              cond_of_hull: this.conditionOfHull,
              cond_of_fittings: this.conditionOfFittings,
              cond_of_davit_lifting: this.conditionOfDavit,
              status_of_integrated_navigation: this.statusOfIntegratedNav,
              max_speed_current_trials: this.maxSpeedCurrent,
              max_rpm_current_trials: this.maxRpmCurrent,
              max_speed_pdi_trials: this.maxSpeedPdi,
              max_rpm_pdi_trials: this.maxRpmPdi,
              remedial_action_speed_trials: this.remedialActionSpeedDrop,
              weighing_undertaken_on: this.weighingUndertakenOn,
              location: this.weighingLocation,
              observed_weight: this.observedWeight,
              weight_recorded_pdi: this.pdiTrialWeight,
              remedial_action_weight: this.remedialActionWeightIncrease,
              major_repairs: this.majorRepairs,
              remaining_life_hull: data?.remaining_life_hull || '-',
              collar_due_date: this.dueDateChangeOfCollar,
              validity_imo_certificate: this.imoCertificateValidity,
              documentUrl: this.documentUrl,
              remarks: data?.remarks || '-',
              board_formation_authority: data?.board_formation_authority || '-',
              board_member1: data?.board_member1 || '-',
              board_member2: data?.board_member2 || '-',
              board_president: data?.board_president || '-',
            };

            this.reportTableData =
              data?.engine_table_data?.map((item: any) => ({
                id: item?.id || null,
                condition_of_engine: item?.condition_engine || '-',
                total_running_hours:
                  item?.total_running_hrs_since_last_return || '-',
                major_routines: item?.major_routines_undertaken || '-',
                remaining_life: item?.access_remaining_engine_life || '-',
              })) || [];

            this.engineTableData =
              data?.engine_table_data?.map((item: any) => ({
                condition_of_engine: item?.condition_engine || '-',
                total_running_hours:
                  item?.total_running_hrs_since_last_return || '-',
                run_since_last_return: item?.s_no || '-',
                major_routines: item?.major_routines_undertaken || '-',
                remaining_life: item?.access_remaining_engine_life || '-',
              })) || [];

            this.cdr.detectChanges();
          }
        },
        error: (err: any) => {
          console.error(err);
        },
      });
  }

  downloadReport(): void {
    window.print();
  }
}
