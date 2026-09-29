import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-accordion',
  standalone: true,
  imports: [CommonModule],
  template: `
   <div class="overflow-hidden rounded-lg border border-white/15 bg-[#0d2438] transition-all duration-300">
    <div
       class="flex cursor-pointer items-center justify-between border-b border-white/15 px-5 py-4 text-white transition-all duration-200 hover:bg-white/5"
      (click)="toggleAccordion()"
    >
      <div class="flex items-center gap-3 text-sm font-semibold tracking-wide">
         <div class="h-6 w-1 rounded-full bg-[#4da6ff]"></div>
        <ng-content select="[accordion-title]"></ng-content>
      </div>

       <div class="flex h-8 w-8 items-center justify-center rounded-md border border-white/20 bg-white/10">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-4 w-4 transition-all duration-300 ease-in-out"
          [class.rotate-180]="isOpen"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          stroke-width="2.5"
        >
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>

    <div
      *ngIf="isOpen"
       class="border-t border-white/15 p-5 text-white transition-all duration-200"
    >
      <ng-content select="[accordion-content]"></ng-content>
    </div>
  </div>
`,
})
export class ParameterAccordionCardComponent {
  @Input() isOpen = false;

  toggleAccordion() {
    this.isOpen = !this.isOpen;
  }
}
