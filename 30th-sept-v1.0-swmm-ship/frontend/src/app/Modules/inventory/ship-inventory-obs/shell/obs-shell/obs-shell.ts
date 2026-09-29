import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-obs-shell",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./obs-shell.html",
  styleUrl: "./obs-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ObsShell {}
