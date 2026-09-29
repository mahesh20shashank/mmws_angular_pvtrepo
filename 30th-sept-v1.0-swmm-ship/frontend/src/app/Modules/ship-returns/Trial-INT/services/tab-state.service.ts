import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TabStateService {
  private readonly activeTabSubject = new BehaviorSubject<string>('draft');
  readonly activeTab$ = this.activeTabSubject.asObservable();

  setActiveTab(tab: string): void {
    this.activeTabSubject.next(tab || 'draft');
  }

  getActiveTab(): string {
    return this.activeTabSubject.getValue();
  }
}
