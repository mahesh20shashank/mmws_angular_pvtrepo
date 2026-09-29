import { Component, ChangeDetectionStrategy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { RouterModule } from "@angular/router";

@Component({
  selector: "app-srar",
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: "./srar.component.html",
  styleUrls: ["./srar.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SrarComponent {

}
