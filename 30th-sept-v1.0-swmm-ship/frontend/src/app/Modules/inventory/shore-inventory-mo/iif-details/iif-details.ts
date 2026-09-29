import { ButtonComponent } from '../../../../shared/components/button/button.component';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from "@angular/core";
import { FormBuilder, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { firstValueFrom } from "rxjs";
import { HelpGuidance } from "../../../../shared/components/help-guidance/help-guidance";
import { NotificationService } from "../../../../Core/services/notification/notification.service";
import { getErrorMessage } from "../../../../Core/http/services/http-feedback";
import { MoApiService } from "../services/mo-api.service";
import { MoCartEntry } from "../models/mo.model";

const HELP_HTML = `<p class="mb-0">Complete the IIF (Item Issue Form) request details for this
  item — identification, pricing, and quantity fields ILMS needs before incatting — then Save.</p>`;

/** Reference: `iif_cart.html`'s row "Edit" action (loads the OBS iif-details form). Real backend:
 * `GET/PATCH ilms/iif/<pk>/` (`IIFViewSet`, a plain `ModelViewSet` — `pk` is the `IIF` cart row's
 * own id; every field lives on that one model, unlike WLMS's split WEDIIF/WEDIIFDetails pair).
 * Item/equipment display fields come from the already-adapted cart row (`getCart("iif")`), not
 * this form — the `IIF` model itself carries no equipment/category fields of its own beyond the
 * `spare_id` FK. */
@Component({
  selector: "app-mo-iif-details",
  standalone: true,
  imports: [ReactiveFormsModule, HelpGuidance, ButtonComponent],
  templateUrl: "./iif-details.html",
  styleUrl: "./iif-details.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IifDetails implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly api = inject(MoApiService);
  private readonly notifications = inject(NotificationService);

  readonly helpHtml = HELP_HTML;
  private id = "";
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly swmmIifNo = signal<string | null>(null);
  readonly entry = signal<MoCartEntry | null>(null);

  readonly form = this.fb.nonNullable.group({
    phoneNumber: [""],
    addressee: [""],
    state: [""],
    emailId: [""],
    panNumber: [""],
    gstNumber: [""],
    fax: [""],
    ncageCode: [""],
    yearIntroduced: [""],
    functionAnticipated: [""],
    aclAnticipated: [""],
    nsnInventoryType: [""],
    classificationOfItem: [""],
    shelfLife: [""],
    priceRef: [""],
    priceDate: [""],
    currencyCode: [""],
    priceCc: [""],
    qty: [""],
    easkBookRef: [""],
    qtyWarReserve: [""],
    qtyConstituent: [""],
    qtyRangeScale: [""],
    qtyShipFit: [""],
    qtyPresent: [""],
    immediateUsage: [""],
    endUsage: [""],
    olditemCode: [""],
  });

  ngOnInit(): void {
    this.id = this.route.snapshot.paramMap.get("id") ?? "";
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [details, cart] = await Promise.all([
        firstValueFrom(this.api.getIifDetail(this.id)),
        firstValueFrom(this.api.getCart("iif")),
      ]);
      this.entry.set(cart.find((row) => row.id === this.id) ?? null);
      this.swmmIifNo.set(details.swmm_iifno);
      this.form.patchValue({
        phoneNumber: details.phone_number ?? "",
        addressee: details.addressee ?? "",
        state: details.state ?? "",
        emailId: details.email_id ?? "",
        panNumber: details.pan_number ?? "",
        gstNumber: details.gst_number ?? "",
        fax: details.fax ?? "",
        ncageCode: details.NCAGE_code ?? "",
        yearIntroduced: details.year_introduced ?? "",
        functionAnticipated: details.function_anticipated ?? "",
        aclAnticipated: details.ACL_anticipated ?? "",
        nsnInventoryType: details.NSN_inventory_type ?? "",
        classificationOfItem: details.classification_of_item ?? "",
        shelfLife: details.shelf_life ?? "",
        priceRef: details.price_ref ?? "",
        priceDate: details.price_date ?? "",
        currencyCode: details.currency_code ?? "",
        priceCc: details.price_cc ?? "",
        qty: details.qty ?? "",
        easkBookRef: details.eask_book_ref ?? "",
        qtyWarReserve: details.qty_war_reserve ?? "",
        qtyConstituent: details.qty_constituent ?? "",
        qtyRangeScale: details.qty_range_scale ?? "",
        qtyShipFit: details.qty_ship_fit ?? "",
        qtyPresent: details.qty_present ?? "",
        immediateUsage: details.immediate_usage ?? "",
        endUsage: details.end_usage ?? "",
        olditemCode: details.olditem_code ?? "",
      });
    } finally {
      this.loading.set(false);
    }
  }

  async submit(): Promise<void> {
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      await firstValueFrom(
        this.api.updateIifDetail(this.id, {
          phone_number: raw.phoneNumber,
          addressee: raw.addressee,
          state: raw.state,
          email_id: raw.emailId,
          pan_number: raw.panNumber,
          gst_number: raw.gstNumber,
          fax: raw.fax,
          NCAGE_code: raw.ncageCode,
          year_introduced: raw.yearIntroduced,
          function_anticipated: raw.functionAnticipated,
          ACL_anticipated: raw.aclAnticipated,
          NSN_inventory_type: raw.nsnInventoryType,
          classification_of_item: raw.classificationOfItem,
          shelf_life: raw.shelfLife,
          price_ref: raw.priceRef,
          price_date: raw.priceDate || null,
          currency_code: raw.currencyCode,
          price_cc: raw.priceCc,
          qty: raw.qty,
          eask_book_ref: raw.easkBookRef,
          qty_war_reserve: raw.qtyWarReserve,
          qty_constituent: raw.qtyConstituent,
          qty_range_scale: raw.qtyRangeScale,
          qty_ship_fit: raw.qtyShipFit,
          qty_present: raw.qtyPresent,
          immediate_usage: raw.immediateUsage,
          end_usage: raw.endUsage,
          olditem_code: raw.olditemCode,
        }),
      );
      this.notifications.success("IIF details saved.");
      void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-mo/transactions/iif");
    } catch (error) {
      this.notifications.error(getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  cancel(): void {
    void this.router.navigateByUrl("/afterAuth/inventory/shore-inventory-mo/transactions/iif");
  }
}
