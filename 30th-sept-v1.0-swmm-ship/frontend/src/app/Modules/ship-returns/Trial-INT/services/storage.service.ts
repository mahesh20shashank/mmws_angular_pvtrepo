import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class StorageService {
  getItem(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {}
  }

  removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  clear(): void {
    try {
      localStorage.clear();
    } catch {}
  }
}
