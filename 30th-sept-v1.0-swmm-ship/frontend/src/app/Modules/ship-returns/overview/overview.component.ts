import { ButtonComponent } from '../../../shared/components/button/button.component';
import { Component, ChangeDetectionStrategy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";
import { ColDef } from "ag-grid-community";
import { IconComponent } from "../../../shared/components/icon/icon.component";
import { DataGrid } from "../../../shared/components/data-grid/data-grid";
import { GridStatusChipRenderer } from "../../../shared/components/data-grid/grid-status-chip-renderer";

interface ReturnSummary {
  id: string;
  category: "SRAR" | "Trial Returns" | "Hull Returns" | "Other Returns";
  title: string;
  referenceNo: string;
  vessel: string;
  date: string;
  status: "Submitted" | "Under Review" | "Approved" | "Action Required";
  priority: "High" | "Medium" | "Low";
}

@Component({
  selector: "app-ship-returns-overview",
  standalone: true,
  imports: [CommonModule, RouterModule, IconComponent, DataGrid, ButtonComponent],
  templateUrl: "./overview.component.html",
  styleUrls: ["./overview.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShipReturnsOverviewComponent {
  stats = signal([
    {
      title: "Total SRAR Returns",
      count: "24",
      subtext: "8 Pending Approval",
      icon: "file-text",
      accentColor: "#3B82F6",
      route: "/afterAuth/ship-returns/srar",
    },
    {
      title: "Trial Returns",
      count: "14",
      subtext: "3 Active Trials",
      icon: "activity",
      accentColor: "#F59E0B",
      route: "/afterAuth/ship-returns/trial-returns",
    },
    {
      title: "Hull Returns",
      count: "19",
      subtext: "2 Inspections Due",
      icon: "shield",
      accentColor: "#10B981",
      route: "/afterAuth/ship-returns/hull-returns",
    },
    {
      title: "Other Returns",
      count: "09",
      subtext: "General Equipment",
      icon: "box",
      accentColor: "#8B5CF6",
      route: "/afterAuth/ship-returns/other-returns",
    },
  ]);

  recentReturns = signal<ReturnSummary[]>([
    {
      id: "SR-2026-001",
      category: "SRAR",
      title: "Main Engine Refit Alteration Return",
      referenceNo: "SRAR/2026/089",
      vessel: "INS Vikramaditya",
      date: "04 Aug 2026",
      status: "Under Review",
      priority: "High",
    },
    {
      id: "SR-2026-002",
      category: "Trial Returns",
      title: "Post-Docking Sea Trial Performance Report",
      referenceNo: "TR/2026/042",
      vessel: "INS Kolkata",
      date: "02 Aug 2026",
      status: "Approved",
      priority: "Medium",
    },
    {
      id: "SR-2026-003",
      category: "Hull Returns",
      title: "Underwater Hull Cathodic Protection Audit",
      referenceNo: "HR/2026/015",
      vessel: "INS Chennai",
      date: "31 Jul 2026",
      status: "Action Required",
      priority: "High",
    },
    {
      id: "SR-2026-004",
      category: "Other Returns",
      title: "Navigational Radar Calibration Return",
      referenceNo: "OR/2026/077",
      vessel: "INS Delhi",
      date: "28 Jul 2026",
      status: "Submitted",
      priority: "Low",
    },
  ]);

  getStatusClass(status: string): string {
    switch (status) {
      case "Approved":
        return "badge-success";
      case "Under Review":
        return "badge-warning";
      case "Action Required":
        return "badge-danger";
      case "Submitted":
      default:
        return "badge-info";
    }
  }

  getPriorityClass(priority: string): string {
    switch (priority) {
      case "High":
        return "priority-high";
      case "Medium":
        return "priority-medium";
      case "Low":
      default:
        return "priority-low";
    }
  }

  readonly recentReturnsColumnDefs: ColDef[] = [
    { headerName: "Ref No.", field: "referenceNo", flex: 1, minWidth: 130 },
    {
      headerName: "Category",
      field: "category",
      flex: 1,
      minWidth: 150,
      cellRenderer: (params: { value: string }) =>
        `<span class="category-pill">${params.value ?? ""}</span>`,
    },
    { headerName: "Title", field: "title", flex: 1.6, minWidth: 220 },
    { headerName: "Vessel", field: "vessel", flex: 1, minWidth: 140 },
    { headerName: "Submitted Date", field: "date", flex: 1, minWidth: 130 },
    {
      headerName: "Priority",
      field: "priority",
      flex: 1,
      minWidth: 110,
      cellRenderer: (params: { value: string }) =>
        `<span class="${this.getPriorityClass(params.value)}">${params.value ?? ""}</span>`,
    },
    {
      headerName: "Status",
      field: "status",
      flex: 1,
      minWidth: 140,
      cellRenderer: GridStatusChipRenderer,
      cellRendererParams: {
        toneMap: {
          Approved: "success",
          "Under Review": "warning",
          "Action Required": "danger",
          Submitted: "info",
        },
      },
    },
    {
      headerName: "Action",
      width: 90,
      sortable: false,
      cellRenderer: () =>
        `<button type="button" class="action-btn" title="View details"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>`,
    },
  ];
}
