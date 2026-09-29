import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-crew-shell",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./crew-shell.html",
  styleUrl: "./crew-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CrewShell {}
