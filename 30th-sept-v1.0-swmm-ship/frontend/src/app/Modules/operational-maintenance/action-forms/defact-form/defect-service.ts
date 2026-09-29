import { Injectable, inject } from "@angular/core";
import { firstValueFrom } from "rxjs";
import { OperationalMaintenanceApi } from "../../services/operational-maintenance-api";

@Injectable({
  providedIn: "root",
})
export class DefectService {
  private calls = inject(OperationalMaintenanceApi);


  async getMasterData(departmentId: number) {
    return await firstValueFrom(this.calls.getDartMasterData(departmentId));
  }

  async getEquipmentObjects(code: string) {
    return await firstValueFrom(this.calls.getEquipmentObjects(code));
  }

  async getNomenclatureDetails(nomenclatureId: number) {
    return await firstValueFrom(
      this.calls.getNomenclatureDetails(nomenclatureId),
    );
  }

  async initiateDart(payload: FormData) {
    return await firstValueFrom(this.calls.initiateDart(payload));
  }
}
