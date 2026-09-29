import { Component, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-trial-returns",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./trial-returns.component.html",
  styleUrls: ["./trial-returns.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialReturnsComponent {}
