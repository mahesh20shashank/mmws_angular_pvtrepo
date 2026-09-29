import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import {
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
} from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Mapping } from '../sfd-config.models';
import { SfdConfigApiService } from '../../services/sfd-config-api.service';
import { DropdownOption, SelectInput } from '../../../../../shared/components';
import { firstValueFrom } from 'rxjs';
import { MasterDataService } from '../../../../../Core/services/master-data/master-data.service';
@Component({
  selector: 'app-mapping-form',
  standalone: true,
  imports: [ReactiveFormsModule, SelectInput, ButtonComponent],
  templateUrl: './mapping-form.html',
  styleUrl: './mapping-form.css',
})
export class MappingForm implements OnInit {

  readonly call = inject(SfdConfigApiService)
  readonly mapping = input<Mapping | null>(null);
  readonly closed = output<void>();
  readonly master = inject(MasterDataService);
  readonly equipmentOptions = this.master.equipmentOptions;
  readonly systemOptions = signal<DropdownOption[]>([]);


  saved = output<void>();
  readonly fb = new FormBuilder();

  form = this.fb.group({
    equip: ['', Validators.required],
    system: ['', Validators.required],
  });

  get isEditMode(): boolean {
    return !!this.mapping();
  }

  ngOnInit(): void {
    void this.initialize();
    void this.loadSystems()
  }

  private async initialize(): Promise<void> {

    if (!this.mapping()) {
      return;
    }

    this.form.patchValue({
      equip: this.mapping()!.equip,
      system: this.mapping()!.systemId,
    });

    this.form.controls.equip.disable();
  }

  /** `systemId`/`equipmentId` on `Mapping` are `universal_id_t_equipment_ship_detail` values
   * (see sfd-config.component.ts's loadMappings), so options must come from the same UID space —
   * `master/systems/` (catalog ids) never matches, which is why the currently-mapped system used
   * to render blank here instead of pre-selected. */
  private async loadSystems(): Promise<void> {
    const response = await firstValueFrom(
      this.call.getEquipmentSystemDropdown()
    );

    this.systemOptions.set(
      response.system.map(system => ({
        label: system.label,
        value: system.universal_id_t_equipment_ship_detail,
      }))
    );
  }



  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    try {
      if (this.isEditMode) {
        await firstValueFrom(
          this.call.updateEquipmentSystemMapping(
            this.mapping()!.equipmentId,
            {
              system: raw.system ?? undefined,
            }
          )
        );
      }

      this.saved.emit();
      this.form.reset();
      this.closed.emit();

    } catch (error) {
      console.error(error);
    }
  }


  closeModal() {
    this.closed.emit();
  }
}
