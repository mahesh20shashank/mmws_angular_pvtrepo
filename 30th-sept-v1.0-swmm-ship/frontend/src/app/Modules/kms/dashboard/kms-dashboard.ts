import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, OnInit, inject, signal } from "@angular/core";
import { RouterLink } from "@angular/router";
import { ColDef } from "ag-grid-community";

import { KpiCard } from "../../../shared/components/kpi-card/kpi-card";
import { PanelCard } from "../../../shared/components/panel-card/panel-card";
import { BarChart } from "../../../shared/components/bar-chart/bar-chart";
import { LineChart } from "../../../shared/components/line-chart/line-chart";
import { ModalComponent } from "../../../shared/components/modal/modal.component";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { PageHeaderBar } from "../../../shared/components/page-header-bar/page-header-bar";
import { HelpGuidance } from "../../../shared/components/help-guidance/help-guidance";
import { KmsStateService } from "../state/kms-state.service";

const HELP_HTML = `
  <h6 class="fw-bold mb-1">What this page is for</h6>
  <p class="mb-2">An overview of the Ship's Role, and a repository of Daily Orders.</p>
  <h6 class="fw-bold mb-1">What each menu group means</h6>
  <ul class="mb-2">
    <li><strong>Op. Maintenance</strong> — defects, equipment routines, and other utilities (engineering department only).</li>
    <li><strong>Inventory</strong> — Ship Inventory (as-is spares, validated against MO/WED), and Shore Inventory (MO/WED) for demand and receipt.</li>
    <li><strong>Ship Returns</strong> — SRAR and Trial Returns reporting.</li>
    <li><strong>Trial Requisitions</strong> — trial requisition proforma sent to trial teams via ITTTM.</li>
    <li><strong>Other Utilities</strong> — Hot Work permits and Tag In/Tag Out records.</li>
    <li><strong>Activity Planner</strong> — department-wise activities planned by the HOD, visible to that department.</li>
    <li><strong>Ship Configuration</strong> — view the Ship Fit Definition (SFD) as available in CMMS.</li>
    <li><strong>Refit Maintenance</strong> — monitors Defect Lists raised by Ship Staff during refit.</li>
    <li><strong>KMS</strong> — certificate expiry, in/out mail, and the document/SharePoint/technical manual repository.</li>
    <li><strong>Ship Crew</strong> — create the Watch &amp; Station Bill, approve Leave Forecast, view crew availability.</li>
  </ul>
  <p class="mb-2"><strong>Tip:</strong> If a menu item you expect isn't showing, it is most likely restricted to a different role or rank.</p>
  <p class="mb-0"><strong>Tip:</strong> Update the Ship's Role text and the five sliding images from the References tab.</p>
`;

@Component({
  selector: "app-kms-dashboard",
  standalone: true,
  imports: [KpiCard, PanelCard, BarChart, LineChart, ModalComponent, DataGrid, RouterLink, PageHeaderBar, HelpGuidance, ButtonComponent],
  templateUrl: "./kms-dashboard.html",
  styleUrl: "./kms-dashboard.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KmsDashboard implements OnInit {
  private readonly store = inject(KmsStateService);

  readonly helpHtml = HELP_HTML;

  /** Hidden for now per request — flip back to true to restore the header bar. */
  readonly showHeaderBar = false;

  readonly stats = this.store.stats;
  readonly dashboardLoading = this.store.dashboardLoading;
  readonly dashboardError = this.store.dashboardError;
  readonly equipmentChartData = this.store.equipmentChartData;
  readonly categoryChartData = this.store.categoryChartData;
  readonly correspondenceLabels = this.store.correspondenceLabels;
  readonly correspondenceSeries = this.store.correspondenceSeries;
  readonly correspondenceDetail = this.store.correspondenceDetail;

  readonly showDetailModal = signal(false);

  readonly detailColumnDefs: ColDef[] = [
    { field: "name", headerName: "Ref / File No.", flex: 1 },
    { field: "certificate_subtype", headerName: "Type", width: 120, valueFormatter: (p) => (p["value"] === "inmail" ? "In-mail" : "Out-mail") },
    { field: "issue_date", headerName: "Date", width: 130 },
    { field: "recieved_from_unit", headerName: "Received From", flex: 1 },
    { field: "addressed_to_unit", headerName: "Addressed To", flex: 1 },
    { field: "remarks", headerName: "Remarks", flex: 1.5 },
  ];

  ngOnInit(): void {
    void this.store.loadDashboard();
  }

  openDetailModal(): void {
    this.showDetailModal.set(true);
  }

  closeDetailModal(): void {
    this.showDetailModal.set(false);
  }
}
