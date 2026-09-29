import { ChangeDetectionStrategy, Component } from "@angular/core";
import { RouterOutlet } from "@angular/router";

@Component({
  selector: "app-mo-shell",
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: "./mo-shell.html",
  styleUrl: "./mo-shell.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoShell {}
