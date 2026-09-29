import { Component, ChangeDetectionStrategy, OnInit, inject } from "@angular/core";

import { FormsModule } from "@angular/forms";
import { RouterOutlet } from "@angular/router";
import { LoaderComponent, Alert, Auth, User } from "./Core";
import { NgxSonnerToaster } from 'ngx-sonner';
@Component({
  selector: "app-root",
  standalone: true,
  imports: [FormsModule, RouterOutlet, LoaderComponent, Alert, NgxSonnerToaster ],
  templateUrl: "./app.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: "./app.css",
})
export class App implements OnInit {
  private readonly authService = inject(Auth);
  private readonly userService = inject(User);

  blockedRoutes = ["/landing"];

  async ngOnInit() {
    const path = window.location.pathname;
    const isBlocked = this.blockedRoutes.includes(path);

    if (!isBlocked && (await this.authService.initializeSession())) {
      await this.userService.getLoggedInUserDetails();
    }
  }
}
