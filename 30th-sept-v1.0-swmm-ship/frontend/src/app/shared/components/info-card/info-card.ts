import { ButtonComponent } from '../button/button.component';
import { Component, Input, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

export interface InfoCardItem {
  label: string;
  value: string | number;
}

@Component({
  selector: "app-info-card",
  standalone: true,
  imports: [CommonModule, IconComponent, ButtonComponent],
  templateUrl: "./info-card.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrls: ["./info-card.css"],
})
export class InfoCard {
  @Input() title = "";

  @Input() actionText = "";

  @Input() sectionTitle = "";

  @Input() items: InfoCardItem[] = [];

  @Input() cardHeight = "24.25rem";
  formatTitle(title?: string | null): string {
    if (!title) {
      return "";
    }

    return title
      .replace(/[_-]+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(" ")
      .filter((word) => word)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
  }
}
