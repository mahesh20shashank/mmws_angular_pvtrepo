import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, input, output, inject, signal } from '@angular/core';
import { DeletePayload } from '../sfd-config.models';
import { SfdConfigApiService } from '../../services/sfd-config-api.service';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-confirmation-alert',
  standalone: true,
  imports: [ButtonComponent],
  templateUrl: './confirmation-alert.html',
  styleUrl: './confirmation-alert.css',
})
export class ConfirmationAlert {
  readonly sfdConfigApi = inject(SfdConfigApiService)
  saved = output<void>();
  readonly payload = input.required<DeletePayload>();
  readonly closed = output<void>();
  readonly deleted = output<DeletePayload>();

  readonly isDeleting = signal(false);
  readonly error = signal<string | null>(null);

  get title(): string {

    switch (this.payload().type) {
      case 'compartment':
        return 'Compartment';
      case 'subDepartment':
        return 'Sub Department';
      case 'mapping':
        return 'Mapping';
      case 'loactionMapping':
        return 'Location Mapping'
      default:
        return '';

    }
  }

  get itemName(): string {
    const payload = this.payload();
    switch (payload.type) {
      case 'compartment':
        return payload.data.name;
      case 'subDepartment':
        return payload.data.name;
      case 'mapping':
        return `${payload.data.system} → ${payload.data.equip}`;
      case "loactionMapping":
        return payload.data.equipment;
      default:
        return '';

    }
  }

  closeModal(): void {
    this.closed.emit();
  }

  async delete(): Promise<void> {
    const payload = this.payload();
    this.isDeleting.set(true);
    this.error.set(null);

    try {
      let request;
      switch (payload.type) {
        case 'compartment':
          request = this.sfdConfigApi.deleteCompartment(payload.data.id);
          break;

        case 'subDepartment':
          request = this.sfdConfigApi.deleteSubdepartment(payload.data.id);
          break;

        case 'mapping':
          request = this.sfdConfigApi.deleteEquipmentSystemMapping(
            payload.data.equipmentId
          );
          break
        case 'loactionMapping':
          request = this.sfdConfigApi.deleteLocationMapping(
            payload.data.id
          );
          break
      }

      const response = await firstValueFrom(request);

      if (response.status === 200 || response.status === 201) {

        this.saved.emit();
        this.closeModal();
      }
    }

  catch (error) {
      console.error('Failed to delete compartment.', error);
    } finally {
      this.isDeleting.set(false);
    }
  }


}
