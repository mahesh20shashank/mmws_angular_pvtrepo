import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-under-construction',
  standalone: true,
  template: `
    <div class="under-construction-container text-dark">
      <div class="icon">🚧</div>
      <h1>Page Under Development</h1>
      <p>This module is currently being developed.</p>
      <p>Please check back soon.</p>
    </div>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .under-construction-container {
      height: 100%;
      min-height: 70vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      text-align: center;
      color: var(--text-primary);
      padding: 2rem;
    }

    .icon {
      font-size: 5rem;
      margin-bottom: 1rem;
    }

    h1 {
      font-size: 2.5rem;
      font-weight: 700;
      margin-bottom: 0.75rem;
    }

    p {
      font-size: 1.1rem;
      opacity: 0.85;
      margin: 0.25rem 0;
    }
  `]
})
export class UnderConstruction {}
