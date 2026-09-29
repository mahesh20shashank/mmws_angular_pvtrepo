import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, computed, DestroyRef, inject, input, OnInit, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CompartmentDropdownOption, CreateLocationMappingPayload, EquipmentCompartmentDropdownOption, LocationMapping } from '../sfd-config.models';
import { SfdConfigApiService } from '../../services/sfd-config-api.service';
import { MasterDataService } from '../../../../../Core/services/master-data/master-data.service';
import { DropdownOption, SelectInput } from '../../../../../shared/components';
import { firstValueFrom } from 'rxjs';
@Component({
  selector: 'app-location-mapping',
  imports: [ReactiveFormsModule, SelectInput, ButtonComponent],
  templateUrl: './location-mapping.html',
  styleUrl: './location-mapping.css',
})
export class LocationMappingForm implements OnInit {

  locationMapping = input<LocationMapping | null>(null);
  readonly isEditMode = computed(() => !!this.locationMapping());
  closed = output<void>();
  saved = output<void>();
  readonly sfdConfigApi = inject(SfdConfigApiService)
  readonly master = inject(MasterDataService)

  isLoading = signal<boolean>(false)

  upperDecks = this.master.upperDecks;
  locations = this.master.locations;
  lowerDecks = this.master.lowerDecks;

  equipmentOptions = signal<DropdownOption[]>([]);
  compartmentOptions = signal<DropdownOption[]>([]);

  readonly deckError = signal(false);
  ngOnInit(): void {
    void this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.loadDropdowns();

    this.listenCompartmentSelection();

    if (this.locationMapping()) {
      this.patchEditForm();
    }
  }
  private patchEditForm(): void {
    const mapping = this.locationMapping();
    if (!mapping) return;

    this.form.patchValue({
      equipmentName: mapping.equipmentId.toString() ?? '',
      compartmentName: mapping.compt_id?.toString() ?? '',
    });
  }

  private compartmentLookup: CompartmentDropdownOption[] = [];

  private async loadDropdowns(): Promise<void> {
    const response = await firstValueFrom(
      this.sfdConfigApi.getEquipmentLocationDropdowns()
    );

    this.compartmentLookup = response.compartment;

    this.equipmentOptions.set(
      response.equipment.map((item: EquipmentCompartmentDropdownOption) => ({
        label: item.label,
        value: item.id,
      }))
    );

    this.compartmentOptions.set(
      response.compartment.map((item: CompartmentDropdownOption) => ({
        label: item.label,
        value: item.id,
      }))
    );
  }
  closeModal() {
    this.submittedSignal.set(false);
    this.form.reset()
    this.closed.emit();
  }

  readonly fb = inject(FormBuilder);
  readonly destroyRef = inject(DestroyRef);

  readonly submittedSignal = signal(false);

  readonly form = this.fb.group({
    equipmentName: ['', Validators.required],
    compartmentName: ['', Validators.required],

    mainDeck: [{ value: false, disabled: true }],
    upperDeck: [{ value: '', disabled: true }],
    lowerDeck: [{ value: '', disabled: true }],

    frameFrom: [{ value: '', disabled: true }, Validators.required],
    frameTo: [{ value: '', disabled: true }, Validators.required],

    location: [{ value: '', disabled: true }, Validators.required],
  });

  private listenCompartmentSelection(): void {
    this.f.compartmentName.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {

        const compartment = this.compartmentLookup.find(
          item => item.id === Number(value)
        );

        // Compartment cleared
        if (!compartment) {
          this.form.patchValue({
            mainDeck: false,
            upperDeck: '',
            lowerDeck: '',
            frameFrom: '',
            frameTo: '',
            location: '',
          });

          this.f.mainDeck.disable({ emitEvent: false });
          this.f.upperDeck.disable({ emitEvent: false });
          this.f.lowerDeck.disable({ emitEvent: false });
          this.f.frameFrom.disable({ emitEvent: false });
          this.f.frameTo.disable({ emitEvent: false });
          this.f.location.disable({ emitEvent: false });

          return;
        }

        // Enable controls
        this.f.mainDeck.enable({ emitEvent: false });
        this.f.upperDeck.enable({ emitEvent: false });
        this.f.lowerDeck.enable({ emitEvent: false });
        this.f.frameFrom.enable({ emitEvent: false });
        this.f.frameTo.enable({ emitEvent: false });
        this.f.location.enable({ emitEvent: false });

        this.form.patchValue({
          mainDeck: compartment.main_deck,
          upperDeck: compartment.upper_deck ?? '',
          lowerDeck: compartment.lower_deck ?? '',
          frameFrom: compartment.frame_station_from?.toString() ?? '',
          frameTo: compartment.frame_station_to?.toString() ?? '',
          location: compartment.location,
        });
      });
  }



  get f() {
    return this.form.controls;
  }



  async save(): Promise<void> {

    this.submittedSignal.set(true);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();

    const payload: CreateLocationMappingPayload = {
      equipment: Number(raw.equipmentName),
      compartment: Number(raw.compartmentName),
    };

    try {
      this.isLoading.set(true);

      // Edit mode PATCHes the existing row (equipment-compartment-mappings/{id}/) — the create
      // endpoint addLocationMapping() hits is instance-less, so its unique_together check would
      // reject the very row being edited. Only compartment can genuinely change on an existing
      // mapping (equipment is its identity), but both are sent so a same-value save is a clean
      // no-op rather than a partial write. Ported from Aug_15.
      const mapping = this.locationMapping();
      const response = await firstValueFrom(
        mapping
          ? this.sfdConfigApi.updateLocationMapping(mapping.id, payload)
          : this.sfdConfigApi.addLocationMapping(payload),
      );

      if (response.status === 201 || response.status === 200) {
        this.saved.emit();
        this.form.reset();
        this.closeModal();
      }
    } catch (error: unknown) {
      console.error(error);
    } finally {
      this.isLoading.set(false);
    }
  }



  showError(control: keyof typeof this.form.controls): boolean {
    const field = this.form.controls[control];

    return field.invalid && (field.touched || this.submittedSignal());
  }
}
