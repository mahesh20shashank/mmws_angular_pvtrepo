import { Component, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DevelopmentInProgress } from "../../../shared/components/development-in-progress/development-in-progress";

@Component({
  selector: "app-hull-returns",
  standalone: true,
  imports: [CommonModule, DevelopmentInProgress],
  templateUrl: "./hull-returns.component.html",
  styleUrls: ["./hull-returns.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HullReturnsComponent {}
