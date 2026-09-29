import { Component, ChangeDetectionStrategy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../../../../shared/components/icon/icon.component";

interface OutboxItem {
  id: string;
  dispatchNo: string;
  recipientAgency: string;
  trialType: string;
  vessel: string;
  dispatchDate: string;
  deliveryStatus: "Dispatched" | "Delivered & Acknowledged" | "Under Review at Agency";
}

@Component({
  selector: "app-trial-outbox",
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: "./trial-outbox.component.html",
  styleUrls: ["./trial-outbox.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialOutboxComponent {
  dispatches = signal<OutboxItem[]>([
    { id: "1", dispatchNo: "DISP-2026-8801", recipientAgency: "Naval Dockyard Mumbai", trialType: "Full Power Sea Trial", vessel: "INS Vikramaditya", dispatchDate: "05 Aug 2026", deliveryStatus: "Delivered & Acknowledged" },
    { id: "2", dispatchNo: "DISP-2026-8802", recipientAgency: "WEAT Command", trialType: "Combat Systems Trial", vessel: "INS Kolkata", dispatchDate: "03 Aug 2026", deliveryStatus: "Under Review at Agency" },
    { id: "3", dispatchNo: "DISP-2026-8803", recipientAgency: "NSTL Visakhapatnam", trialType: "Sonar Calibration Trial", vessel: "INS Chennai", dispatchDate: "30 Jul 2026", deliveryStatus: "Dispatched" },
  ]);
}
