import { Injectable, signal, effect } from '@angular/core';

export type Theme = 'light' | 'dark';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly STORAGE_KEY = 'swmm-theme';

  /** Current theme signal — default is dark */
  theme = signal<Theme>('dark');

  constructor() {
    // Apply the theme whenever the signal changes
    effect(() => {
      this.applyTheme(this.theme());
    });
  }

  /**
   * Call this once from MainLayout.ngOnInit to restore
   * the saved preference (or default to dark).
   */
  initTheme(): void {
    const saved = localStorage.getItem(this.STORAGE_KEY) as Theme | null;
    const initial: Theme = saved === 'light' ? 'light' : 'dark';
    this.setTheme(initial);
  }

  /** Toggle between dark and light */
  toggleTheme(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.setTheme(next);
  }

  /**
   * Sets the theme and always re-applies the DOM attribute, even if the
   * signal value is unchanged (signals skip the effect on an equal value —
   * needed because OuterLayout writes `data-theme` directly on the landing
   * page, outside this service, so the DOM can drift out of sync with the
   * signal).
   */
  setTheme(theme: Theme): void {
    this.theme.set(theme);
    this.applyTheme(theme);
    localStorage.setItem(this.STORAGE_KEY, theme);
  }

  private applyTheme(theme: Theme): void {
    document.documentElement.dataset['theme'] = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }
}
