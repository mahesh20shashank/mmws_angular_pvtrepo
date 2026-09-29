import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-wed-shell",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./wed-shell.html",
  styleUrl: "./wed-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WedShell {}
