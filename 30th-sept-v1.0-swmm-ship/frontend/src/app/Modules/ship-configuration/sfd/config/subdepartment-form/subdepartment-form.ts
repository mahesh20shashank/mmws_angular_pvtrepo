import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, computed, inject, input, OnInit, output } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CreateSubdepartmentPayload, SubDepartment } from '../sfd-config.models';
import { MasterDataService } from '../../../../../Core/services/master-data/master-data.service';
import { SfdConfigApiService } from '../../services/sfd-config-api.service';
import { firstValueFrom } from 'rxjs';
import { SelectInput } from '../../../../../shared/components';
import { IconComponent } from '../../../../../shared/components/icon/icon.component';
@Component({
  selector: 'app-subdepartment-form',
  imports: [ReactiveFormsModule, SelectInput, IconComponent, ButtonComponent],
  templateUrl: './subdepartment-form.html',
  styleUrl: './subdepartment-form.css',
})
export class SubdepartmentForm  implements OnInit {

  readonly subDepartment = input<SubDepartment | null>(null);
  readonly master = inject(MasterDataService)
  readonly sfdConfigApi = inject(SfdConfigApiService)
  readonly fb = new FormBuilder();
  saved = output<void>();
  departments = this.master.departments;

  readonly isEditMode = computed(() => !!this.subDepartment());


  closed = output<void>();

  ngOnInit(): void {
    if (this.isEditMode()) {
      const subDepartment = this.subDepartment();

      if (subDepartment) {
        this.form.patchValue({
          subdepartmentName: subDepartment.name,
          department:subDepartment.department,
          // equipmentCount: subDepartment.equipment_count,
        });
      }
    }
  }

  readonly form = this.fb.nonNullable.group({
    subdepartmentName: ['', Validators.required],
    department: ['', Validators.required],
    // equipmentCount: [0, Validators.required],
    // equipmentCount: [null as number | null, [
    //   Validators.required,
    //   Validators.min(1),
    // ]],
  });

  closeModal() {
     this.form.reset()
    this.closed.emit();
  }

  async onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue()
    const payload:  CreateSubdepartmentPayload  = {
      name: raw.subdepartmentName,
      department: raw.department
      // equipment_count: raw.equipmentCount!
    }

    try {
      let response;

      if (this.isEditMode()) {
        response = await firstValueFrom(
          this.sfdConfigApi.updateSubDepartment(
            this.subDepartment()!.id,
            payload
          )
        );
      } else {
        response = await firstValueFrom(
          this.sfdConfigApi.addSubDepartment(payload)
        );
      }
      if (response.status === 201 || response.status === 200) {
        this.saved.emit()
        this.form.reset();
        this.closeModal();
      }
    } catch (error) {
      console.error('error', error)
    }
  }

}
