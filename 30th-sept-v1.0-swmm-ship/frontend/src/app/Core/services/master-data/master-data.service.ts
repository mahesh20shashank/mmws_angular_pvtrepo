import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CommonApiService } from '../../http/services/api.service';
import { ConfigurationOptions, DropdownOption, EquipmentSystemMasterData } from './master-data.type';

@Injectable({
    providedIn: 'root',
})
export class MasterDataService {

    readonly commonApiService = inject(CommonApiService);

    private loaded = false;
    private equipmentSystemLoaded = false;

    configuration = signal<ConfigurationOptions | null>(null);
    equipmentSystem = signal<EquipmentSystemMasterData | null>(null);

    async load() {

        if (this.loaded) return;

        const res = await firstValueFrom(
            this.commonApiService.getConfigurationOptions()
        );

        this.configuration.set(res);
        this.loaded = true;
    }

    async loadEquipmentSystemDropdowns() {
        if (this.equipmentSystemLoaded) {
            return;
        }

        const res = await firstValueFrom(
            this.commonApiService.getEquipmentSystemDropdowns()
        );

        this.equipmentSystem.set(res);
        this.equipmentSystemLoaded = true;
    }

    upperDecks = () =>
        this.configuration()?.compartment.upper_decks ?? [];

    lowerDecks = () =>
        this.configuration()?.compartment.lower_decks ?? [];

    locations = () =>
        this.configuration()?.compartment.locations ?? [];

    departments = () =>
        this.configuration()?.department ?? [];

    equipmentOptions = computed<DropdownOption[]>(() =>
        (this.equipmentSystem()?.equipment ?? []).map(item => ({
            label: item.label,
            value: item.universal_id_t_equipment_ship_detail,
        }))
    );

    systemOptions = computed<DropdownOption[]>(() =>
        (this.equipmentSystem()?.system ?? []).map(item => ({
            label: item.label,
            value: item.universal_id_t_equipment_ship_detail,
        }))
    );

    equipmentDropdown = () =>
        this.equipmentSystem()?.equipment ?? [];

    systemDropdown = () =>
        this.equipmentSystem()?.system ?? [];


}
