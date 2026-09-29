import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, computed, inject, input, output, signal, effect } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Compartment, CreateCompartmentPayload } from '../sfd-config.models';
import { SfdConfigApiService } from '../../services/sfd-config-api.service';
import { firstValueFrom } from 'rxjs';
import { MasterDataService } from '../../../../../Core/services/master-data/master-data.service';
import { SelectInput } from '../../../../../shared/components';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';

@Component({
  selector: 'app-compartment-from',
  imports: [ReactiveFormsModule, SelectInput, IconComponent, ButtonComponent],
  templateUrl: './compartment-form.html',
  styleUrl: './compartment-form.css',
})
export class CompartmentForm {

  compartment = input<Compartment | null>(null);
  readonly isEditMode = computed(() => !!this.compartment());
  closed = output<void>();
  /** Emits the just-created/updated Compartment (not just a bare "something changed" signal) —
   *  a caller that needs to act on the new record directly (e.g. the SFD Actions Add form's own
   *  "+ Add Compartment" shortcut auto-selecting it once saved, sfd-management.component.ts)
   *  doesn't have to re-fetch and guess which one it was. Existing callers that only cared about
   *  "something changed" (e.g. sfd-config.component.html's `(saved)="loadCompartments()"`) are
   *  unaffected — they simply ignore the payload. */
  saved = output<Compartment>();
  readonly sfdConfigApi = inject(SfdConfigApiService)
  readonly master = inject(MasterDataService)

  isLoading = signal<boolean>(false)

  locations = this.master.locations;

  readonly deckOptions = computed(() => [
    { value: '01', label: 'main deck' },
    ...(this.master.upperDecks() ?? []),
    ...(this.master.lowerDecks() ?? []),
  ]);

  readonly fb = inject(FormBuilder);
  readonly submittedSignal = signal(false);

  readonly form: FormGroup = this.fb.group({
    compartmentName: ['', [Validators.required, Validators.pattern(/^[a-zA-Z0-9 ]+$/), Validators.minLength(2),
      Validators.maxLength(32)
      ]],
    deck: ['', Validators.required],
    frameFrom: ['',[ Validators.required, Validators.min(1)]],
    frameTo: ['',[ Validators.required, Validators.min(1)]],
    location: ['', Validators.required],
  });

  closeModal() {
    this.form.reset()
    this.closed.emit();
  }

  constructor() {
    effect(() => {
      const compartment = this.compartment();

      if (compartment) {
        const deckValue = compartment.main_deck
          ? '01'
          : (compartment.upper_deck || compartment.lower_deck || '');

        this.form.patchValue({
          id: compartment.id,
          compartmentName: compartment.name,
          deck: deckValue,
          frameFrom: compartment.frame_station_from,
          frameTo: compartment.frame_station_to,
          location: compartment.location_value || compartment.location,
        });
      } else {
        this.form.reset({
          compartmentName: '',
          deck: '',
          frameFrom: '',
          frameTo: '',
          location: '',
        });
      }
    });
  }

  get f() {
    return this.form.controls;
  }



 async save() {
  if (this.form.invalid) {
    this.form.markAllAsTouched();
    return;
  }

  const raw = this.form.getRawValue();
  const deckValue = raw.deck;

  let mainDeck = false;
  let upperDeck: string | null = null;
  let lowerDeck: string | null = null;

  if (deckValue === '01') {
    mainDeck = true;
  } else {
    const upperDecksValues = this.master.upperDecks()?.map(d => d.value) ?? [];
    const lowerDecksValues = this.master.lowerDecks()?.map(d => d.value) ?? [];

    if (upperDecksValues.includes(deckValue)) {
      upperDeck = deckValue;
    } else if (lowerDecksValues.includes(deckValue)) {
      lowerDeck = deckValue;
    }
  }

  const payload: CreateCompartmentPayload = {
    name: raw.compartmentName,
    main_deck: mainDeck,
    upper_deck: upperDeck,
    lower_deck: lowerDeck,
    frame_station_from: Number(raw.frameFrom),
    frame_station_to: Number(raw.frameTo),
    frame_station: raw.frame_station || '',
    location: raw.location,
    location_value: raw.location
  };

   try {
     this.isLoading.set(true)
     const compartment = this.compartment();
     const request = this.isEditMode() && compartment
       ? this.sfdConfigApi.updateCompartment(compartment.id, payload)
       : this.sfdConfigApi.addCompartment(payload);

     const response = await firstValueFrom(request);
       if (response.status === 201 || response.status === 200) {
         if (response.body?.data) {
           this.saved.emit(response.body.data);
         }
         this.form.reset();
         this.closeModal();
       }
  } catch (error: unknown) {
    console.error(error);
   }
   finally {
     this.isLoading.set(false)
   }

  }

  showError(control: keyof typeof this.form.controls): boolean {
    const field = this.form.controls[control];

    return field.invalid && (field.touched || this.submittedSignal());
  }
}
