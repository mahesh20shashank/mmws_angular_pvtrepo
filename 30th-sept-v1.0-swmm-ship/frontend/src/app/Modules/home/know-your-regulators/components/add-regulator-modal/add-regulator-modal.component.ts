import { Component, Input, Output, EventEmitter, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ButtonComponent, IconComponent, ModalComponent } from '../../../../../shared/components';
import { DepartmentRegulators, RegulatorSailor, SubDepartmentRegulators } from '../../know-your-regulators.model';

export interface ManualRegulatorPayload {
  firstName: string;
  lastName: string;
  designation: string;
  rank: string;
  personalNumber: string;
  subDepartmentName?: string;
}
@Component({
  selector: 'app-add-regulator-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal
      size="lg"
      title="ADD REGULATOR"
      (closeModal)="onClose()"
    >
      <div class="ar-modal-body">
        <!-- Top Section: Select Sailors to Promote -->
        <div class="ar-section">
          <h3 class="ar-dept-title">{{ departmentName }}</h3>
          <p class="ar-section-subtitle">Tick the sailors who should appear as regulators for this slot.</p>

          <div class="ar-table-container">
            <table class="ar-table">
              <thead>
                <tr>
                  <th class="ar-th-check">
                    <input
                      type="checkbox"
                      [checked]="sailorsList.length > 0 && selectedSailorIds().size === sailorsList.length"
                      (change)="toggleSelectAll($event)"
                    />
                  </th>
                  <th class="ar-th">NAME</th>
                  <th class="ar-th">RANK</th>
                  <th class="ar-th">PERSONAL NO.</th>
                </tr>
              </thead>
              <tbody>
                @for (sailor of sailorsList; track sailor.id) {
                  <tr class="ar-tr">
                    <td class="ar-td ar-td-check">
                      <input
                        type="checkbox"
                        [checked]="selectedSailorIds().has(sailor.id)"
                        (change)="toggleSailorSelection(sailor.id)"
                      />
                    </td>
                    <td class="ar-td ar-td-name"><strong>{{ sailor.name }}</strong></td>
                    <td class="ar-td">{{ sailor.rank || '-' }}</td>
                    <td class="ar-td">{{ sailor.personalNumber || '-' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="4" class="ar-td-empty">
                      No sailors in this department to promote
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <div class="ar-action-row">
            @if (selectedSailorIds().size > 0) {
              <span class="ar-selected-count">{{ selectedSailorIds().size }} selected</span>
            }
            <app-button
              type="button"
              variant="primary"
              [disabled]="saving || selectedSailorIds().size === 0"
              (click)="onConfirmMark()"
            >
              <app-icon name="user-check" [size]="14" color="#ffffff" style="margin-right: 6px;" />
              {{ saving ? 'SAVING…' : 'MARK AS REGULATORS (' + selectedSailorIds().size + ')' }}
            </app-button>
          </div>
        </div>

        <div class="ar-divider"></div>

        <!-- Bottom Section: Manual Creation -->
        <div class="ar-section">
          <p class="ar-section-subtitle ar-manual-subtitle">
            Or create a regulator manually, when the person is not on the sailor list.
          </p>

          <div class="ar-form-grid">
            <div class="ar-form-group">
              <label class="ar-form-label" for="arFirstName">FIRST NAME <span class="ar-required">*</span></label>
              <input
                id="arFirstName"
                type="text"
                class="ar-form-input"
                placeholder="Required"
                [ngModel]="firstName()"
                (ngModelChange)="firstName.set($event)"
              />
            </div>

            <div class="ar-form-group">
              <label class="ar-form-label" for="arLastName">LAST NAME</label>
              <input
                id="arLastName"
                type="text"
                class="ar-form-input"
                placeholder=""
                [ngModel]="lastName()"
                (ngModelChange)="lastName.set($event)"
              />
            </div>

            <div class="ar-form-group">
              <label class="ar-form-label" for="arDesignation">DESIGNATION</label>
              <input
                id="arDesignation"
                type="text"
                class="ar-form-input"
                placeholder="e.g. ME Regulator"
                [ngModel]="designation()"
                (ngModelChange)="designation.set($event)"
              />
            </div>

            <div class="ar-form-group">
              <label class="ar-form-label" for="arRank">RANK</label>
                  <select
                id="arRank"
                    class="ar-form-input ar-form-select"
                [ngModel]="rank()"
                (ngModelChange)="rank.set($event)"
                  >
                    @for (rk of rankOptions; track rk) {
                      <option [value]="rk === '-- No rank --' ? '' : rk" [disabled]="rk === '-- No rank --'">{{ rk }}</option>
                    }
                  </select>
            </div>

            <div class="ar-form-group ar-form-group-full">
              <label class="ar-form-label" for="arPersonalNo">PERSONAL NUMBER</label>
              <input
                id="arPersonalNo"
                type="text"
                class="ar-form-input"
                placeholder="Up to 15 characters"
                [ngModel]="personalNumber()"
                (ngModelChange)="personalNumber.set($event)"
              />
            </div>
          </div>

          @if (error) {
            <div class="ar-form-error">{{ error }}</div>
          }
        </div>
      </div>

      <div class="ar-modal-footer">
        <app-button type="button" class="ar-btn-cancel" (click)="onClose()">CANCEL</app-button>
        <app-button
          type="button"
          variant="primary"
          [disabled]="saving"
          (click)="onConfirmCreateManual()"
        >
          <app-icon name="plus" [size]="14" color="#ffffff" style="margin-right: 6px;" />
          {{ saving ? 'CREATING…' : 'CREATE REGULATOR' }}
        </app-button>
      </div>
    </app-modal>
  `,
  styles: [`
    :host {
      display: block;
    }

    .ar-modal-body {
      display: flex; flex-direction: column; gap: 16px;
      min-width: 480px; max-width: 680px; padding: 4px 0; box-sizing: border-box;
    }

    .ar-dept-title { font-size: 1.15rem; font-weight: 800; color: var(--text-primary); text-transform: uppercase; letter-spacing: 0.3px; margin: 0 0 2px 0; }
    .ar-section-subtitle { font-size: 0.8rem; color: var(--text-muted); margin: 0 0 12px 0; line-height: 1.4; }

    .ar-table-container { border: 1px solid var(--border-primary); border-radius: 6px; overflow: hidden; background: var(--bg-card); }
    .ar-table { width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem; }
    .ar-table thead { background-color: var(--bg-input); }
    .ar-th { padding: 10px 14px; font-weight: 700; font-size: 0.72rem; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; border-bottom: 1px solid var(--border-primary); }
    .ar-th-check, .ar-td-check { width: 44px; text-align: center; padding: 10px 8px; }
    .ar-tr { border-bottom: 1px solid var(--border-primary); transition: background-color 0.15s ease; }
    .ar-tr:hover { background-color: var(--bg-input); }
    .ar-td { padding: 10px 14px; color: var(--text-primary); vertical-align: middle; }
    .ar-td-name strong { color: var(--text-primary); }
    .ar-td-empty { padding: 20px 14px; text-align: center; color: var(--text-muted); font-weight: 600; font-size: 0.85rem; }

    .ar-action-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; margin-top: 12px; }
    .ar-selected-count { font-size: 0.78rem; font-weight: 600; color: var(--text-muted); }

     
    .ar-divider { height: 1px; background-color: var(--border-primary); margin: 8px 0; }
    .ar-manual-subtitle { font-weight: 500; color: var(--text-muted); margin-bottom: 14px; }
    .ar-form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; }
    .ar-form-group-full { grid-column: span 2; }
    .ar-form-label { display: block; font-size: 0.72rem; font-weight: 800; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 6px; }
    .ar-required { color: #ef4444; }

    .ar-form-input {
      width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-primary);
      background: var(--bg-input); color: var(--text-primary); font-size: 0.85rem; box-sizing: border-box; outline: none; transition: border-color 0.15s ease;
    }
    .ar-form-input:focus { border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15); }
    .ar-form-select { cursor: pointer; }
    .ar-form-error { color: #ef4444; font-size: 0.8rem; margin-top: 8px; }

    .ar-modal-footer { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--border-primary); }

    .ar-btn-cancel {
      padding: 9px 20px; border-radius: 6px; border: 1px solid var(--border-primary); background: var(--bg-input);
      color: var(--text-muted); font-size: 0.8rem; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase; cursor: pointer; transition: background-color 0.15s ease;
    }
    .ar-btn-cancel:hover { background: var(--bg-input-disabled); }

    @media (max-width: 768px) {
      .ar-modal-body { min-width: 100%; }
      .ar-form-grid { grid-template-columns: 1fr; }
    }
  `]
})
export class AddRegulatorModalComponent {
  @Input() department: DepartmentRegulators | null = null;
  @Input() subDepartmentName: string = '';
  @Input() sailorsList: RegulatorSailor[] = [];
  @Input() saving: boolean = false;
  @Input() error: string = '';
  @Input() rankOptions: string[] = [];

  @Output() closeModal = new EventEmitter<void>();
  @Output() markAsRegulators = new EventEmitter<number[]>();
  @Output() createManualRegulator = new EventEmitter<ManualRegulatorPayload>();

  readonly selectedSailorIds = signal<Set<number>>(new Set());
  readonly firstName = signal<string>('');
  readonly lastName = signal<string>('');
  readonly designation = signal<string>('');
  readonly rank = signal<string>('');
  readonly personalNumber = signal<string>('');

  get departmentName(): string {
    if (!this.department) return '';
    const dept = this.department.name || this.department.dep_name || 'DEPARTMENT';
    return this.subDepartmentName ? `${dept} (${this.subDepartmentName})` : dept;
  }

  //toggle
  toggleSelectAll(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    if (checked) {
      this.selectedSailorIds.set(new Set(this.sailorsList.map((s) => s.id)));
    } else {
      this.selectedSailorIds.set(new Set());
    }
  }

  toggleSailorSelection(id: number): void {
    const next = new Set(this.selectedSailorIds());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.selectedSailorIds.set(next);
  }

  onConfirmMark(): void {
    this.markAsRegulators.emit(Array.from(this.selectedSailorIds()));
  }

  onConfirmCreateManual(): void {
    this.createManualRegulator.emit({
      firstName: this.firstName(),
      lastName: this.lastName(),
      designation: this.designation(),
      rank: this.rank(),
      personalNumber: this.personalNumber(),
      subDepartmentName: this.subDepartmentName,
    });
  }

  onClose(): void {
    this.closeModal.emit();
  }
}
