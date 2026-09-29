import { Component, ChangeDetectionStrategy, Input, signal, OnInit, OnDestroy } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../icon/icon.component";

@Component({
  selector: "app-development-in-progress",
  standalone: true,
  imports: [CommonModule, IconComponent],
  templateUrl: "./development-in-progress.html",
  styleUrl: "./development-in-progress.css",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DevelopmentInProgress implements OnInit, OnDestroy {
  @Input() title = "Development in Progress";
  @Input() subtitle = "This page is under construction. We're working hard to bring you the best experience.";

  progressWidth = signal<number>(0);
  private timerId: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    // Smooth filling animation to target ~80%
    setTimeout(() => {
      this.progressWidth.set(80);
    }, 100);
  }

  ngOnDestroy(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
    }
  }
}
