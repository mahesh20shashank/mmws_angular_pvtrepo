import { Component, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { DevelopmentInProgress } from "../../../shared/components/development-in-progress/development-in-progress";

@Component({
  selector: "app-other-returns",
  standalone: true,
  imports: [CommonModule, DevelopmentInProgress],
  templateUrl: "./other-returns.component.html",
  styleUrls: ["./other-returns.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtherReturnsComponent {}
