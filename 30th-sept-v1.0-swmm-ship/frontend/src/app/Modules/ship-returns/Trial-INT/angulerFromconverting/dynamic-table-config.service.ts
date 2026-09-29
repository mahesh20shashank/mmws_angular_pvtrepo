import { Injectable } from '@angular/core';

export type DynamicConditionOperator =
  | 'exists'
  | 'notExists'
  | 'equals'
  | 'notEquals'
  | 'in'
  | 'notIn';

export interface DynamicVisibilityCondition {
  field: string;
  value?: any;
  values?: any[];
  operator?: DynamicConditionOperator;
}

export interface DynamicVisibilityNode {
  showIf?: DynamicVisibilityCondition | DynamicVisibilityCondition[];
}

@Injectable({ providedIn: 'root' })
export class DynamicTableConfigService {
  isVisible(
    node: DynamicVisibilityNode | null | undefined,
    formData: Record<string, any> = {},
  ): boolean {
    const showIf = node?.showIf;
    if (!showIf) {
      return true;
    }

    const conditions = Array.isArray(showIf) ? showIf : [showIf];
    return conditions.every((condition) => this.matchesCondition(condition, formData));
  }

  private matchesCondition(
    condition: DynamicVisibilityCondition | null | undefined,
    formData: Record<string, any> = {},
  ): boolean {
    if (!condition?.field) {
      return true;
    }

    const targetValue = this.resolvePathValue(formData, condition.field);

    switch (condition.operator || 'equals') {
      case 'exists':
        return !this.isEmptyValue(targetValue);
      case 'notExists':
        return this.isEmptyValue(targetValue);
      case 'notEquals':
        return !this.valuesEqual(targetValue, condition.value);
      case 'in':
        return (condition.values || []).some((value) => this.valuesEqual(targetValue, value));
      case 'notIn':
        return !(condition.values || []).some((value) => this.valuesEqual(targetValue, value));
      case 'equals':
      default:
        return this.valuesEqual(targetValue, condition.value);
    }
  }

  private resolvePathValue(source: Record<string, any>, path: string): any {
    if (!source || !path) {
      return undefined;
    }

    if (Object.prototype.hasOwnProperty.call(source, path)) {
      return source[path];
    }

    return String(path)
      .split('.')
      .reduce((value: any, key: string) => (value == null ? undefined : value[key]), source);
  }

  private isEmptyValue(value: any): boolean {
    return (
      value === null ||
      value === undefined ||
      value === '' ||
      (Array.isArray(value) && value.length === 0)
    );
  }

  private valuesEqual(actual: any, expected: any): boolean {
    if (Array.isArray(actual)) {
      return actual.some((item) => this.valuesEqual(item, expected));
    }

    if (Array.isArray(expected)) {
      return expected.some((item) => this.valuesEqual(actual, item));
    }

    if (actual === expected) {
      return true;
    }

    return this.normalizeComparableValue(actual) === this.normalizeComparableValue(expected);
  }

  private normalizeComparableValue(value: any): string {
    if (value && typeof value === 'object') {
      const optionValue = value.value ?? value.id ?? value.key ?? value.label;
      return String(optionValue ?? '').trim().toLowerCase();
    }

    return String(value ?? '').trim().toLowerCase();
  }
}
