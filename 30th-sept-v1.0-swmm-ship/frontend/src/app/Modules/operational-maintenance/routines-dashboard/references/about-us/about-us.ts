import { ButtonComponent } from '../../../../../shared/components/button/button.component';
import { Component, OnDestroy, OnInit } from "@angular/core";

interface CarouselSlide {
  src: string;
  alt: string;
}

@Component({
  selector: "app-about-us",
  imports: [ButtonComponent],
  templateUrl: "./about-us.html",
  styleUrl: "./about-us.css",
})
export class AboutUs implements OnInit, OnDestroy {
  // Matches the source project's active carousel slides (other images in
  // ems_aboutus_img/ are commented out there too — a.JPG, c.jpg, e.JPG unused).
  slides: CarouselSlide[] = [
    { src: "assests/images/about-us/b.jpg", alt: "V Aditya" },
    { src: "assests/images/about-us/d.jpg", alt: "Banner" },
  ];

  activeIndex = 0;
  private intervalId?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.intervalId = setInterval(() => this.next(), 5000);
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  next(): void {
    this.activeIndex = (this.activeIndex + 1) % this.slides.length;
  }

  prev(): void {
    this.activeIndex = (this.activeIndex - 1 + this.slides.length) % this.slides.length;
  }

  goTo(index: number): void {
    this.activeIndex = index;
  }
}
