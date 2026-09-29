import { Component, inject } from "@angular/core";
import { ICellRendererAngularComp } from "ag-grid-angular";
import { ICellRendererParams } from "ag-grid-community";
import { CommonModule } from "@angular/common";
import { Router } from "@angular/router";

interface FussActionRendererData {
  pk?: string | number;
  sr_ids?: (string | number)[];
}

@Component({
  selector: "app-fuss-action-renderer",
  standalone: true,
  imports: [CommonModule],
  styleUrl: './fuss-action-renderer.css',
  template: `
    <div class="actions-wrapper">
      <button
        type="button"
        class="btn-close-routine"
        (click)="closeRoutine()"
      >
        Close Routine
      </button>

      <button
        type="button"
        class="btn-raise-fuss"
        (click)="raiseFuss()"
      >
        Raise FUSS
      </button>
    </div>
  `,
})
export class FussActionRendererComponent implements ICellRendererAngularComp {
  private router = inject(Router);
  params!: ICellRendererParams;

  agInit(params: ICellRendererParams): void {
    this.params = params;
  }

  refresh(): boolean {
    return true;
  }

  closeRoutine(): void {
    const data = this.params.data as FussActionRendererData | undefined;
    this.router.navigate(["/afterAuth/op-maintenance/routine/close-fuss"], {
      state: {
        routineId: data?.pk,
      },
    });
  }

  raiseFuss(): void {
    const data = this.params.data as FussActionRendererData | undefined;
    this.router.navigate(
      ["/afterAuth/op-maintenance/routine/fuss-triger-raise-fuss"],
      {
        state: {
          selectedIds: data?.sr_ids,
        },
      },
    );
  }
}
