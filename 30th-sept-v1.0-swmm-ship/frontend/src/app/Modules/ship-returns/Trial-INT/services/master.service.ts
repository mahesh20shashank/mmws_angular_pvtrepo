import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../api.service';

@Injectable({ providedIn: 'root' })
export class MasterService {
  private readonly api = inject(ApiService);

  getClasses(): Observable<any> { return this.api.get('master/ship-classes/'); }
  getLocations(): Observable<any> { return this.api.get('master/locations/'); }
  getEquipment(): Observable<any> { return this.api.get('master/equipments/'); }
  getCompartments(shipId?: any): Observable<any> {
    return this.api.get(shipId ? `master/compartments/?ship_id=${shipId}` : 'master/compartments/');
  }
  getVessels(): Observable<any> { return this.api.get('master/ships/'); }
  getShipsByClass(id: string | number): Observable<any> {
    return this.api.get(`master/ships/?shipClass=${id}`);
  }
  getDropDownOptionsByDropDownKey(key: string): Observable<any> {
    return this.api.get(`master/lookups/?dropdown__key=${encodeURIComponent(key)}`);
  }
  getCommands(): Observable<any> { return this.api.get('master/commands/'); }
  getShipsByCommand(cmdId?: any): Observable<any> {
    return this.api.get(cmdId ? `master/ships/?command=${cmdId}` : 'master/ships/');
  }
  getBoatsRegistrationNumber(shipId?: any): Observable<any> {
    return this.api.get(shipId ? `master/boat-details/?ship_id=${shipId}` : 'master/boat-details/');
  }
  getBoats(): Observable<any> { return this.api.get('master/boat-details/'); }
  getDockYards(): Observable<any> { return this.api.get('master/dockyards/'); }
  getClusters(): Observable<any> { return this.api.get('master/clusters/'); }
  getReferenceElectrodes(): Observable<any> { return this.api.get('master/reference-electrodes/'); }
  getRefits(): Observable<any> { return this.api.get('master/refits/'); }
  getUnits(): Observable<any> { return this.api.get('master/units/'); }
}
