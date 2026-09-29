import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from "@angular/core";
import { ColDef } from "ag-grid-community";
import { firstValueFrom, Observable } from "rxjs";
import { CollapsibleSidebar } from "../../../shared/components/collapsible-sidebar/collapsible-sidebar";
import { DataGrid, IconComponent , StatusChip} from "../../../shared/components";
import { OperationalMaintenanceApi } from "../services/operational-maintenance-api";
import { NotificationService } from "../../../Core/services/notification/notification.service";

const API_BACKED_SECTION_IDS = [
  "shipMasterRemarks",
  "certificateTypeMaster",
  "repairAgencyMaster",
  "assistanceMaster",
  "reasonMaster",
  "servityMaster",
  "servicesMaster",
] as const;

type ApiBackedSectionId = (typeof API_BACKED_SECTION_IDS)[number];

@Component({
  selector: "app-opm-configuration",
  standalone: true,
  imports: [CollapsibleSidebar, DataGrid, IconComponent, StatusChip],
  templateUrl: "./opm-configuration.component.html",
  styleUrls: ["./opm-configuration.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OpmConfigurationComponent implements OnInit {
  private readonly call = inject(OperationalMaintenanceApi);
  private readonly notify = inject(NotificationService);

  readonly masterRows = signal<Record<ApiBackedSectionId, Record<string, unknown>[]>>({
    shipMasterRemarks: [],
    certificateTypeMaster: [],
    repairAgencyMaster: [],
    assistanceMaster: [],
    reasonMaster: [],
    servityMaster: [],
    servicesMaster: [],
  });

  readonly masterLoading = signal<Record<ApiBackedSectionId, boolean>>({
    shipMasterRemarks: false,
    certificateTypeMaster: false,
    repairAgencyMaster: false,
    assistanceMaster: false,
    reasonMaster: false,
    servityMaster: false,
    servicesMaster: false,
  });

  readonly referenceSidebarCollapsed = signal(false);
  readonly selectedReferenceSection = signal("shipMasterRemarks");
  readonly referenceSections = signal([
    {
      id: "shipMasterRemarks",
      title: "Ship Remarks Master",
      icon: "message-square",
      subHeading: "Ship remark codes selectable against each DART when an RA is drafted (3.7).",
      // count: 2,
      description: "Ship remark codes selectable against each DART when an RA is drafted (3.7).",
    },
    {
      id: "certificateTypeMaster",
      title: "Certificate Type Master",
      icon: "award",
      subHeading: "",
      count: 2,
      description: "HQ-issued certificate types recorded when a defect cannot be resolved. Source: Configuration (HQ-issued). Read only.",
    },
    {
      id: "repairAgencyMaster",
      title: "Repair Agency Master",
      icon: "users",
      subHeading: "",
      count: 2,
      description: "Authorised repair agencies to which a DART / RA can be routed. Source: Configuration (HQ-issued). Read only.",
    },
    {
      id: "assistanceMaster",
      title: "Assistance Master",
      icon: "life-buoy",
      subHeading: "",
      count: 2,
      description: "Trade / department categories of assistance selectable when raising a Required Assistance (RA).",
    },
    {
      id: "reasonMaster",
      title: "Reason Master",
      icon: "key",
      subHeading: "",
      count: 2,
      description: "Drives branch logic at transaction initiation — the selected reason renders the applicable fields and workflow.",
    },
    {
      id: "servityMaster",
      title: "Severity Master",
      icon: "triangle-alert",
      subHeading: "",
      count: 2,
      description: "Defines operational severity and tooltip guidance shown during defect capture.",
    },
    {
      id: "servicesMaster",
      title: "Services Master",
      icon: "wrench",
      subHeading: "",
      count: 2,
      description: "Defines operational severity and tooltip guidance shown during defect capture.",
    },
  ]);

  readonly referenceSidebarItems = computed(() =>
    this.referenceSections().map((item) => ({
      id: item.id,
      label: item.title,
      subHeading: item.subHeading,
      badge: item.count,
      icon: item.icon,
    }))
  );

  readonly referenceDataMap: Record<
    string,
    {
      columns: ColDef[];
      rows: Record<string, unknown>[];
    }
    > = {
      shipMasterRemarks: {
        columns: [
          { headerName: "Remark", field: "remark", flex: 1 },
          { headerName: "Raised By", field: "raised_by", flex: 1 },
          { headerName: "Used On", field: "used_on", flex: 1 },
        ],
        rows: [],
      },

      certificateTypeMaster: {
        columns: [
          { headerName: "Certificate", field: "certificate", flex: 1 },
          { headerName: "Meaning", field: "meaning", flex: 2 },
        ],
        rows: [],
      },

      repairAgencyMaster: {
        columns: [
          { headerName: "Agency", field: "agency", flex: 1 },
          { headerName: "Description", field: "description", flex: 2 },
          { headerName: "Location", field: "location", flex: 1 },
          { headerName: "Type", field: "agency_type", flex: 1 },
        ],
        rows: [],
      },


      assistanceMaster: {
        columns: [
          { headerName: "Assistance", field: "assistance", flex: 1 },
          { headerName: "Description", field: "description", flex: 2 },
          { headerName: "Owning Department", field: "department_name", flex: 1.5 },
        ],
        rows: [],
      },

      reasonMaster: {
        columns: [
          { headerName: "Reason", field: "repair_agency_name", flex: 1 },
          { headerName: "Sub-Types", field: "sub_types", flex: 2 },
          { headerName: "Drives", field: "drives", flex: 2 },
        ],
        rows: [],
      },

      servityMaster: {
        columns: [
          { headerName: "Severity", field: "severity_code", flex: 1 },
          { headerName: "Description", field: "description", flex: 2 },
          { headerName: "Colour", field: "colour", flex: 1 },
        ],
        rows: [],
      },

      servicesMaster: {
        columns: [
          { headerName: "Service", field: "service", flex: 1 },
          { headerName: "Type", field: "service_type", flex: 2 },
          { headerName: "Requires Equipment", field: "requires_equipment", flex: 1.5 },
        ],
        rows: [],
      },


    };

  readonly currentReference = computed(() => {
    return (
      this.referenceSections().find(
        (x) => x.id === this.selectedReferenceSection()
      ) ?? this.referenceSections()[0]
    );
  });

  readonly referenceColumnDefs = computed(
    () =>
      this.referenceDataMap[this.selectedReferenceSection()]?.columns ?? []
  );

  readonly referenceRowData = computed(() => {
    const id = this.selectedReferenceSection();
    if (this.isApiBackedSection(id)) {
      return this.masterRows()[id];
    }
    return this.referenceDataMap[id]?.rows ?? [];
  });

  readonly referenceLoading = computed(() => {
    const id = this.selectedReferenceSection();
    return this.isApiBackedSection(id) ? this.masterLoading()[id] : false;
  });

  readonly referenceTotalCount = computed(
    () => this.referenceRowData().length
  );

  dynamicGridHeight(): string {
    return "calc(100vh - 250px)";
  }

  ngOnInit(): void {
    void this.loadMaster("shipMasterRemarks", this.call.getShipRemarksMaster(), (item) => ({
      remark: item.remark,
      raised_by: item.raised_by,
      used_on: item.used_on,
    }));

    void this.loadMaster("certificateTypeMaster", this.call.getCertificateTypeMaster(), (item) => ({
      certificate: item.certificate,
      meaning: item.meaning,
    }));

    void this.loadMaster("repairAgencyMaster", this.call.getRepairAgencyMaster(), (item) => ({
      agency: item.agency,
      description: item.description,
      location: item.location,
      agency_type: item.agency_type,
    }));

    void this.loadMaster("assistanceMaster", this.call.getAssistanceMaster(), (item) => ({
      assistance: item.assistance,
      description: item.description,
      department_name: item.department_name ?? "",
    }));

    void this.loadMaster("reasonMaster", this.call.getReasonMaster(), (item) => ({
      repair_agency_name: item.repair_agency_name,
      sub_types: (item.sub_types ?? []).join(", "),
      drives: (item.drives ?? []).join(", "),
    }));

    void this.loadMaster("servityMaster", this.call.getSeverityMaster(), (item) => ({
      severity_code: item.severity_code,
      description: item.description,
      colour: item.colour,
    }));

    void this.loadMaster("servicesMaster", this.call.getServicesMaster(), (item) => ({
      service: item.service,
      service_type: item.service_type,
      requires_equipment: item.requires_equipment,
    }));
  }

  selectReference(id: string): void {
    this.selectedReferenceSection.set(id);
  }

  isApiBackedSection(id: string): id is ApiBackedSectionId {
    return (API_BACKED_SECTION_IDS as readonly string[]).includes(id);
  }

  private async loadMaster<T>(
    id: ApiBackedSectionId,
    request: Observable<T[]>,
    mapRow: (item: T) => Record<string, unknown>
  ): Promise<void> {
    this.masterLoading.update((state) => ({ ...state, [id]: true }));
    try {
      const res = await firstValueFrom(request);
      const rows = (res ?? []).map(mapRow);
      this.masterRows.update((state) => ({ ...state, [id]: rows }));
    } catch {
      const title = this.referenceSections().find((s) => s.id === id)?.title ?? id;
      this.notify.error(`Failed to load ${title}.`);
    } finally {
      this.masterLoading.update((state) => ({ ...state, [id]: false }));
    }
  }
}
