import { Component, ChangeDetectionStrategy, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import { IconComponent } from "../../../../shared/components/icon/icon.component";
import { PanelCard } from "../../../../shared/components/panel-card/panel-card";

export interface CarouselSlide {
  id: number;
  title: string;
  subtitle: string;
  imageUrl: string;
}

export interface AgencyInfo {
  name: string;
  role: string;
  location: string;
  contactEmail: string;
}

@Component({
  selector: "app-trial-aboutus",
  standalone: true,
  imports: [CommonModule, IconComponent, PanelCard],
  templateUrl: "./trial-aboutus.component.html",
  styleUrls: ["./trial-aboutus.component.css"],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrialAboutusComponent {
  activeSlide = signal<number>(0);

  slides: CarouselSlide[] = [
    {
      id: 0,
      title: "INS Kochi (D64)",
      subtitle: "Kolkata-class Guided Missile Destroyer",
      imageUrl: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 1,
      title: "Kolkata-class Destroyer",
      subtitle: "Advanced Indigenous Stealth Warship",
      imageUrl: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?q=80&w=1200&auto=format&fit=crop",
    },
    {
      id: 2,
      title: "Naval Fleet Operations",
      subtitle: "Sea Trial & Maintenance Evaluation",
      imageUrl: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?q=80&w=1200&auto=format&fit=crop",
    },
  ];

  agencies = signal<AgencyInfo[]>([
    { name: "Naval Dockyard Mumbai", role: "Dockyard Trial Authority (DTA)", location: "Mumbai, Maharashtra", contactEmail: "dta.mumbai@navy.gov.in" },
    { name: "WEAT Command", role: "Weapons & Electronics Systems Authority", location: "Visakhapatnam, AP", contactEmail: "weat.hq@navy.gov.in" },
    { name: "NSTL Visakhapatnam", role: "Naval Science & Technological Laboratory", location: "Visakhapatnam, AP", contactEmail: "director.nstl@drdo.in" },
    { name: "CQA(N) New Delhi", role: "Controllerate of Quality Assurance (Naval)", location: "New Delhi", contactEmail: "cqan.delhi@gov.in" },
  ]);

  prevSlide(): void {
    this.activeSlide.update((idx) => (idx === 0 ? this.slides.length - 1 : idx - 1));
  }

  nextSlide(): void {
    this.activeSlide.update((idx) => (idx === this.slides.length - 1 ? 0 : idx + 1));
  }

  setSlide(index: number): void {
    this.activeSlide.set(index);
  }
}
