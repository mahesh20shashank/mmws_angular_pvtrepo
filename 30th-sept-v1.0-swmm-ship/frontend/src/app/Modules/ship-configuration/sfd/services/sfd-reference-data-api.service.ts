import { inject, Injectable } from "@angular/core";
import { AppService } from "../../../../Core/services/app/app.service";
import { skipFeedback } from "../../../../Core/http/services/http-feedback";
import {
  SelectActiveShipResult,
  ShipDirectoryOptionsResponse,
  ShipDirectoryPullResult,
  SubDepartmentReadiness,
} from "../sfd-references/sfd-references.models";
import {
  RhsiMasterAutoAssignResponse,
  RhsiMasterListResponse,
  RhsiMasterSaveResponse,
  RhsiMasterSaveRow,
} from "../sfd-references/rhsi-master.models";

/** API layer for the Ship Configuration "Reference Data" screen — ship directory
 *  selection, sub-department readiness gate, and the RHSI master grid. */
@Injectable({ providedIn: "root" })
export class SfdReferenceDataApiService {
  private readonly appService = inject(AppService);

  /** STEP 0: pulls the fleet-wide M_Command + M_Ship masters from CMMS into local tables.
   *  `skipFeedback({ toast: true })` — runShipDirectoryPull() (sfd-references.component.ts)
   *  already shows its own success/error toast with a Step-0-specific title; without this, the
   *  global HTTP interceptor's generic auto-toast fired too, showing two "Pulled N commands..."
   *  popups for the same click. Ported from Aug_15. */
  pullShipDirectory() {
    return this.appService.post<ShipDirectoryPullResult>(
      "api/v1/sfd/ship-directory/pull/",
      {},
      { context: skipFeedback({ toast: true }) },
    );
  }

  /** Local Command/Ship dropdown options for Step 0, plus the currently active ship. */
  getShipDirectoryOptions() {
    return this.appService.get<ShipDirectoryOptionsResponse>("api/v1/sfd/ship-directory/options/");
  }

  /** Persists the operator's Step 0 ship choice — every sync resolves its ship from here. */
  selectActiveShip(universalIdMShip: string) {
    return this.appService.post<SelectActiveShipResult>("api/v1/sfd/ship-directory/select/", {
      universal_id_m_ship: universalIdMShip,
    });
  }

  /** Step 2 gate: how many Active equipment still have no sub department assigned. */
  getSubDepartmentReadiness() {
    return this.appService.get<SubDepartmentReadiness>("api/v1/sfd/sub-department-readiness/");
  }

  /** Bulk equipment-masters table: Sub Department / ILMS Vendor Code / System Status / RHSI. */
  getRhsiMaster() {
    return this.appService.get<RhsiMasterListResponse>("api/v1/sfd/rhsi-master/");
  }

  saveRhsiMaster(rows: RhsiMasterSaveRow[]) {
    return this.appService.post<RhsiMasterSaveResponse>("api/v1/sfd/rhsi-master/save/", { rows });
  }

  /** ADMIN/SHIPADMIN only — load-balances every still-unassigned equipment across its
   *  department's existing sub departments in one shot. Never touches an already-assigned
   *  row and never creates a sub department. */
  autoAssignSubDepartments() {
    return this.appService.post<RhsiMasterAutoAssignResponse>("api/v1/sfd/rhsi-master/auto-assign/", {});
  }
}
