/**
 * Optional matrix cell formulas (opt-in). Tables without `formula` are unchanged.
 *
 * Legacy row scope:
 * { "formula": { "op": "sum", "scope": "row", "sources": ["valA", "valB"] } }
 *
 * Legacy column scope:
 * { "formula": { "op": "sum", "scope": "column", "sourceKey": "valA" } }
 *
 * Expression scope (advanced):
 * { "formula": { "expression": "((num(top) - num(bottom)) * 100) / num(top)", "decimals": 2 } }
 */

export type MatrixFormulaOp = 'sum' | 'subtract' | 'multiply' | 'divide';
export type MatrixFormulaScope = 'row' | 'column';

export interface MatrixCellFormula {
  op?: MatrixFormulaOp;
  scope?: MatrixFormulaScope;
  /** Advanced formula expression. Takes precedence over legacy op/scope config. */
  expression?: string;
  /** Row scope: cell keys in the same row. */
  sources?: string[];
  /** Column scope: cell key to aggregate from each data row (sources[0] also works). */
  sourceKey?: string;
  decimals?: number;
  /** When true (default), empty/non-numeric values count as 0. */
  emptyAsZero?: boolean;
  /**
   * Column scope only (default true): skip rows that contain any column-formula cell
   * so total/footer rows are not double-counted.
   */
  excludeFormulaRows?: boolean;
}

export interface MatrixFormulaRow {
  _id?: string;
  cells: {
    _id?: string;
    key?: string;
    value?: unknown;
    formula?: MatrixCellFormula;
  }[];
}

export interface MatrixFormulaContext {
  /** Current table id, used by table(...) functions and payload writes. */
  tableId?: string;
  /** Flat form payload: fields as scalars and tables as row arrays. */
  formData?: Record<string, unknown>;
}

export type FormulaPrimitive = string | number | boolean | null | undefined;
type FormulaValue = FormulaPrimitive | FormulaValue[];

interface ExpressionContext extends MatrixFormulaContext {
  rows: MatrixFormulaRow[];
  row: MatrixFormulaRow;
  targetCell: MatrixFormulaRow['cells'][number];
  formula: MatrixCellFormula;
}

interface Token {
  type: 'number' | 'string' | 'identifier' | 'operator' | 'paren' | 'comma' | 'bracket' | 'eof';
  value: string;
}

export function hasMatrixFormulas(rows: MatrixFormulaRow[] | null | undefined): boolean {
  return (rows ?? []).some((row) =>
    (row.cells ?? []).some((cell) => isValidFormula(cell.formula)),
  );
}

export function isFormulaCell(cell: { formula?: MatrixCellFormula } | null | undefined): boolean {
  return isValidFormula(cell?.formula);
}

export function applyMatrixFormulas<T extends MatrixFormulaRow>(
  rows: T[],
  context: MatrixFormulaContext = {},
): T[] {
  if (!hasMatrixFormulas(rows)) return rows;

  const afterRow = applyRowFormulas(rows);
  const afterColumn = applyColumnFormulas(afterRow);
  return applyExpressionFormulas(afterColumn, context);
}

export function evaluateFormulaExpression(
  formula: MatrixCellFormula | undefined,
  formData: Record<string, unknown> = {},
  localValues: Record<string, unknown> = {},
): FormulaPrimitive {
  if (!isExpressionFormula(formula)) return '';

  const row: MatrixFormulaRow = {
    cells: Object.entries(localValues).map(([key, value]) => ({ key, value })),
  };

  const targetCell = { key: '__field_formula_target__', value: undefined };

  return evaluateExpressionFormula({
    formData,
    rows: [row],
    row,
    targetCell,
    formula,
  });
}

/** Row-wise: reads `sources` from cells in the same row only. */
export function applyRowFormulas<T extends MatrixFormulaRow>(rows: T[]): T[] {
  if (!rows.some((row) => row.cells?.some((cell) => isRowFormula(cell.formula)))) {
    return rows;
  }

  return rows.map((row) => {
    if (!row.cells?.some((cell) => isRowFormula(cell.formula))) return row;

    const valueByKey = buildValueMap(row, { skipFormulaCells: true });
    return {
      ...row,
      cells: row.cells.map((cell) => {
        if (!isRowFormula(cell.formula)) return cell;
        return {
          ...cell,
          value: evaluateFromKeys(cell.formula, valueByKey),
        };
      }),
    };
  });
}

/** Column-wise: aggregates `sourceKey` / `sources` from all data rows into total-row cells. */
export function applyColumnFormulas<T extends MatrixFormulaRow>(rows: T[]): T[] {
  const targets: { rowIndex: number; cellIndex: number; formula: MatrixCellFormula }[] = [];

  rows.forEach((row, rowIndex) => {
    row.cells?.forEach((cell, cellIndex) => {
      if (isColumnFormula(cell.formula)) {
        targets.push({ rowIndex, cellIndex, formula: cell.formula });
      }
    });
  });

  if (!targets.length) return rows;

  const result = cloneRows(rows);

  for (const { rowIndex, cellIndex, formula } of targets) {
    const numbers = collectColumnNumbers(result, formula, rowIndex);
    result[rowIndex].cells[cellIndex] = {
      ...result[rowIndex].cells[cellIndex],
      value: evaluateFromNumbers(formula, numbers),
    };
  }

  return result as T[];
}

export function isRowFormula(
  formula: MatrixCellFormula | undefined,
): formula is MatrixCellFormula {
  return isLegacyFormula(formula) && getScope(formula) === 'row';
}

export function isColumnFormula(
  formula: MatrixCellFormula | undefined,
): formula is MatrixCellFormula {
  return isLegacyFormula(formula) && getScope(formula) === 'column';
}

function applyExpressionFormulas<T extends MatrixFormulaRow>(
  rows: T[],
  context: MatrixFormulaContext,
): T[] {
  const targets: { rowIndex: number; cellIndex: number; formula: MatrixCellFormula }[] = [];

  rows.forEach((row, rowIndex) => {
    row.cells?.forEach((cell, cellIndex) => {
      if (isExpressionFormula(cell.formula)) {
        targets.push({ rowIndex, cellIndex, formula: cell.formula });
      }
    });
  });

  if (!targets.length) return rows;

  const result = cloneRows(rows);
  for (const { rowIndex, cellIndex, formula } of targets) {
    const targetCell = result[rowIndex].cells[cellIndex];
    result[rowIndex].cells[cellIndex] = {
      ...targetCell,
      value: evaluateExpressionFormula({
        ...context,
        rows: result,
        row: result[rowIndex],
        targetCell,
        formula,
      }),
    };
  }

  return result as T[];
}

function isValidFormula(formula: MatrixCellFormula | undefined): formula is MatrixCellFormula {
  if (!formula) return false;
  if (isExpressionFormula(formula)) return true;
  return isLegacyFormula(formula);
}

function isExpressionFormula(
  formula: MatrixCellFormula | undefined,
): formula is MatrixCellFormula {
  return typeof formula?.expression === 'string' && formula.expression.trim().length > 0;
}

function isLegacyFormula(formula: MatrixCellFormula | undefined): formula is MatrixCellFormula {
  if (!formula?.op) return false;
  if (getScope(formula) === 'column') {
    return resolveColumnKeys(formula).length > 0;
  }
  return Array.isArray(formula.sources) && formula.sources.length > 0;
}

function getScope(formula: MatrixCellFormula): MatrixFormulaScope {
  return formula.scope === 'column' ? 'column' : 'row';
}

function resolveColumnKeys(formula: MatrixCellFormula): string[] {
  if (formula.sourceKey) return [formula.sourceKey];
  return formula.sources ?? [];
}

function cloneRows<T extends MatrixFormulaRow>(rows: T[]): T[] {
  return rows.map((row) => ({
    ...row,
    cells: row.cells.map((cell) => ({ ...cell })),
  })) as T[];
}

function buildValueMap(
  row: MatrixFormulaRow,
  options?: { skipFormulaCells?: boolean; skipCell?: MatrixFormulaRow['cells'][number] },
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const cell of row.cells ?? []) {
    if (!cell.key || cell === options?.skipCell) continue;
    if (options?.skipFormulaCells && isFormulaCell(cell)) continue;
    map[cell.key] = cell.value;
  }
  return map;
}

function buildTableValueMap(
  rows: MatrixFormulaRow[],
  targetCell?: MatrixFormulaRow['cells'][number],
): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  for (const row of rows) {
    for (const cell of row.cells ?? []) {
      if (!cell.key || cell === targetCell) continue;
      map[cell.key] = cell.value;
    }
  }
  return map;
}

function collectColumnNumbers(
  rows: MatrixFormulaRow[],
  formula: MatrixCellFormula,
  targetRowIndex: number,
): number[] {
  const keys = resolveColumnKeys(formula);
  const emptyAsZero = formula.emptyAsZero !== false;
  const excludeFormulaRows = formula.excludeFormulaRows !== false;
  const numbers: number[] = [];

  rows.forEach((row, rowIndex) => {
    if (rowIndex === targetRowIndex) return;
    if (excludeFormulaRows && rowHasColumnFormula(row)) return;

    for (const key of keys) {
      const sourceCell = row.cells?.find((cell) => cell.key === key && !isFormulaCell(cell));
      if (!sourceCell) continue;
      const parsed = parseNumeric(sourceCell.value, emptyAsZero);
      if (parsed === null) {
        if (!emptyAsZero) numbers.push(NaN);
        continue;
      }
      numbers.push(parsed);
    }
  });

  return numbers;
}

function rowHasColumnFormula(row: MatrixFormulaRow): boolean {
  return (row.cells ?? []).some((cell) => isColumnFormula(cell.formula));
}

function evaluateFromKeys(
  formula: MatrixCellFormula,
  valueByKey: Record<string, unknown>,
): string | number {
  const emptyAsZero = formula.emptyAsZero !== false;
  const keys = formula.sources ?? [];
  const numbers = keys.map((key) => parseNumeric(valueByKey[key], emptyAsZero));
  return evaluateFromNumbers(formula, numbers);
}

function evaluateFromNumbers(formula: MatrixCellFormula, numbers: (number | null)[]): string | number {
  const emptyAsZero = formula.emptyAsZero !== false;

  if (!emptyAsZero && numbers.every((n) => n === null || Number.isNaN(n))) {
    return '';
  }

  const resolved = numbers.map((n) => (n === null || Number.isNaN(n) ? 0 : n));
  if (!resolved.length) return emptyAsZero ? formatNumericResult(0, formula.decimals) : '';

  let result: number;
  switch (formula.op) {
    case 'sum':
      result = resolved.reduce((acc, n) => acc + n, 0);
      break;
    case 'subtract':
      result = resolved.slice(1).reduce((acc, n) => acc - n, resolved[0] ?? 0);
      break;
    case 'multiply':
      result = resolved.reduce((acc, n) => acc * n, resolved.length === 1 ? resolved[0] : 1);
      break;
    case 'divide': {
      if (resolved.length < 2) return '';
      const divisor = resolved[1];
      if (isZeroOrInvalidDivisor(divisor)) return '';
      result = (resolved[0] ?? 0) / divisor;
      break;
    }
    default:
      return '';
  }

  if (!Number.isFinite(result)) return '';
  return formatNumericResult(result, formula.decimals);
}

function evaluateExpressionFormula(context: ExpressionContext): FormulaPrimitive {
  try {
    const parser = new FormulaExpressionParser(context.formula.expression || '', context);
    return formatExpressionResult(parser.parse(), context.formula);
  } catch {
    return '';
  }
}

class FormulaExpressionParser {
  private readonly tokens: Token[];
  private index = 0;
  private readonly rowValues: Record<string, unknown>;
  private readonly tableValues: Record<string, unknown>;

  constructor(
    expression: string,
    private readonly context: ExpressionContext,
  ) {
    this.tokens = tokenize(expression);
    this.rowValues = buildValueMap(context.row, { skipCell: context.targetCell });
    this.tableValues = buildTableValueMap(context.rows, context.targetCell);
  }

  parse(): FormulaValue {
    const value = this.parseLogicalOr();
    this.expect('eof');
    return value;
  }

  private parseLogicalOr(): FormulaValue {
    let left = this.parseLogicalAnd();
    while (this.matchOperator('||')) {
      const right = this.parseLogicalAnd();
      left = toBoolean(left) || toBoolean(right);
    }
    return left;
  }

  private parseLogicalAnd(): FormulaValue {
    let left = this.parseEquality();
    while (this.matchOperator('&&')) {
      const right = this.parseEquality();
      left = toBoolean(left) && toBoolean(right);
    }
    return left;
  }

  private parseEquality(): FormulaValue {
    let left = this.parseComparison();
    while (this.peek().type === 'operator' && ['==', '!=', '===', '!=='].includes(this.peek().value)) {
      const op = this.advance().value;
      const right = this.parseComparison();
      const equal = valuesEqual(left, right);
      left = op === '==' || op === '===' ? equal : !equal;
    }
    return left;
  }

  private parseComparison(): FormulaValue {
    let left = this.parseAdditive();
    while (this.peek().type === 'operator' && ['>', '>=', '<', '<='].includes(this.peek().value)) {
      const op = this.advance().value;
      const right = this.parseAdditive();
      left = compareValues(left, right, op);
    }
    return left;
  }

  private parseAdditive(): FormulaValue {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'operator' && ['+', '-'].includes(this.peek().value)) {
      const op = this.advance().value;
      const right = this.parseMultiplicative();
      if (op === '+') {
        left = shouldConcat(left, right)
          ? `${stringValue(left)}${stringValue(right)}`
          : this.numberValue(left) + this.numberValue(right);
      } else {
        left = this.numberValue(left) - this.numberValue(right);
      }
    }
    return left;
  }

  private parseMultiplicative(): FormulaValue {
    let left = this.parseUnary();
    while (this.peek().type === 'operator' && ['*', '/', '%'].includes(this.peek().value)) {
      const op = this.advance().value;
      const right = this.parseUnary();
      const divisor = this.numberValue(right);
      if (op === '*') left = this.numberValue(left) * divisor;
      if (op === '/') left = isZeroOrInvalidDivisor(divisor) ? null : this.numberValue(left) / divisor;
      if (op === '%') left = isZeroOrInvalidDivisor(divisor) ? null : this.numberValue(left) % divisor;
    }
    return left;
  }

  private parseUnary(): FormulaValue {
    if (this.matchOperator('-')) return -this.numberValue(this.parseUnary());
    if (this.matchOperator('+')) return this.numberValue(this.parseUnary());
    if (this.matchOperator('!')) return !toBoolean(this.parseUnary());
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaValue {
    const token = this.advance();
    if (token.type === 'number') return Number(token.value);
    if (token.type === 'string') return token.value;

    if (token.type === 'identifier') {
      if (this.matchParen('(')) {
        const args = this.parseCallArguments();
        return this.callFunction(token.value, args);
      }
      return this.resolveIdentifier(token.value);
    }

    if (token.type === 'paren' && token.value === '(') {
      const value = this.parseLogicalOr();
      this.expect('paren', ')');
      return value;
    }

    if (token.type === 'bracket' && token.value === '[') {
      const values: FormulaValue[] = [];
      if (this.matchBracket(']')) return values;
      do {
        values.push(this.parseLogicalOr());
      } while (this.matchComma());
      this.expect('bracket', ']');
      return values;
    }

    throw new Error(`Unexpected token ${token.value}`);
  }

  private parseCallArguments(): FormulaValue[] {
    const args: FormulaValue[] = [];
    if (this.matchParen(')')) return args;
    do {
      args.push(this.parseLogicalOr());
    } while (this.matchComma());
    this.expect('paren', ')');
    return args;
  }

  private resolveIdentifier(name: string): FormulaValue {
    if (name === 'true') return true;
    if (name === 'false') return false;
    if (name === 'null') return null;

    const rowValue = resolvePathValue(this.rowValues, name);
    if (rowValue !== undefined) return rowValue as FormulaValue;

    const tableValue = resolvePathValue(this.tableValues, name);
    if (tableValue !== undefined) return tableValue as FormulaValue;

    const fieldValue = resolvePathValue(this.context.formData || {}, name);
    return fieldValue as FormulaValue;
  }

  private callFunction(name: string, args: FormulaValue[]): FormulaValue {
    const normalizedName = name.toLowerCase();

    switch (normalizedName) {
      case 'num':
      case 'number':
        return this.numberValue(args[0], args.length > 1 ? this.numberValue(args[1]) : undefined);
      case 'numtext':
      case 'numbertext':
        return parseNumberFromText(args[0], args.length > 1 ? this.numberValue(args[1]) : 0);
      case 'value':
        return this.resolveIdentifier(stringValue(args[0]));
      case 'row':
        return resolvePathValue(this.rowValues, stringValue(args[0])) as FormulaValue;
      case 'cell':
        return resolvePathValue(this.tableValues, stringValue(args[0])) as FormulaValue;
      case 'field':
        return resolvePathValue(this.context.formData || {}, stringValue(args[0])) as FormulaValue;
      case 'table':
        return this.resolveTableValue(args);
      case 'sum':
        return this.numericArgs(args).reduce((acc, value) => acc + value, 0);
      case 'avg': {
        const values = this.numericArgs(args);
        return values.length ? values.reduce((acc, value) => acc + value, 0) / values.length : 0;
      }
      case 'min': {
        const values = this.numericArgs(args);
        return values.length ? Math.min(...values) : 0;
      }
      case 'max': {
        const values = this.numericArgs(args);
        return values.length ? Math.max(...values) : 0;
      }
      case 'sumtable':
        return aggregateTableValues(this.getTableRows(args[0]), stringValue(args[1]), 'sum', this.context.formula);
      case 'avgtable':
        return aggregateTableValues(this.getTableRows(args[0]), stringValue(args[1]), 'avg', this.context.formula);
      case 'mintable':
        return aggregateTableValues(this.getTableRows(args[0]), stringValue(args[1]), 'min', this.context.formula);
      case 'maxtable':
        return aggregateTableValues(this.getTableRows(args[0]), stringValue(args[1]), 'max', this.context.formula);
      case 'abs':
        return Math.abs(this.numberValue(args[0]));
      case 'ceil':
        return Math.ceil(this.numberValue(args[0]));
      case 'floor':
        return Math.floor(this.numberValue(args[0]));
      case 'sqrt':
        return Math.sqrt(this.numberValue(args[0]));
      case 'pow':
        return Math.pow(this.numberValue(args[0]), this.numberValue(args[1]));
      case 'round':
        return roundNumber(this.numberValue(args[0]), this.numberValue(args[1], 0));
      case 'if':
        return toBoolean(args[0]) ? args[1] : args[2];
      default:
        return '';
    }
  }

  private resolveTableValue(args: FormulaValue[]): FormulaValue {
    const rows = this.getTableRows(args[0]);
    const requestedIndex = Math.trunc(this.numberValue(args[1], 0));
    const rowIndex = requestedIndex > 0 ? requestedIndex - 1 : requestedIndex;
    const key = stringValue(args[2]);
    const row = rows[rowIndex];
    return row ? (resolvePathValue(row, key) as FormulaValue) : undefined;
  }

  private getTableRows(tableIdValue: FormulaValue): Record<string, unknown>[] {
    const tableId = stringValue(tableIdValue);
    if (tableId && tableId === this.context.tableId) {
      return rowsToObjects(this.context.rows);
    }

    const tableRows = resolvePathValue(this.context.formData || {}, tableId);
    return Array.isArray(tableRows) ? tableRows as Record<string, unknown>[] : [];
  }

  private numericArgs(args: FormulaValue[]): number[] {
    return flattenValues(args).map((value) => this.numberValue(value));
  }

  private numberValue(value: FormulaValue, fallback?: number): number {
    const parsed = parseNumeric(value, this.context.formula.emptyAsZero !== false);
    if (parsed === null || !Number.isFinite(parsed)) return fallback ?? 0;
    return parsed;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private advance(): Token {
    return this.tokens[this.index++];
  }

  private matchOperator(value: string): boolean {
    if (this.peek().type === 'operator' && this.peek().value === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchParen(value: string): boolean {
    if (this.peek().type === 'paren' && this.peek().value === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchBracket(value: string): boolean {
    if (this.peek().type === 'bracket' && this.peek().value === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchComma(): boolean {
    if (this.peek().type === 'comma') {
      this.index++;
      return true;
    }
    return false;
  }

  private expect(type: Token['type'], value?: string): void {
    const token = this.advance();
    if (token.type !== type || (value !== undefined && token.value !== value)) {
      throw new Error(`Expected ${value ?? type}`);
    }
  }
}

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (/\d|\./.test(char)) {
      const start = index;
      index++;
      while (index < expression.length && /\d|\./.test(expression[index])) index++;
      tokens.push({ type: 'number', value: expression.slice(start, index) });
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      index++;
      let value = '';
      while (index < expression.length && expression[index] !== quote) {
        if (expression[index] === '\\' && index + 1 < expression.length) {
          value += expression[index + 1];
          index += 2;
          continue;
        }
        value += expression[index++];
      }
      index++;
      tokens.push({ type: 'string', value });
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      const start = index;
      index++;
      while (index < expression.length && /[A-Za-z0-9_.$]/.test(expression[index])) index++;
      tokens.push({ type: 'identifier', value: expression.slice(start, index) });
      continue;
    }

    const threeCharOp = expression.slice(index, index + 3);
    if (['===', '!=='].includes(threeCharOp)) {
      tokens.push({ type: 'operator', value: threeCharOp });
      index += 3;
      continue;
    }

    const twoCharOp = expression.slice(index, index + 2);
    if (['>=', '<=', '==', '!=', '&&', '||'].includes(twoCharOp)) {
      tokens.push({ type: 'operator', value: twoCharOp });
      index += 2;
      continue;
    }

    if ('+-*/%><!'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index++;
      continue;
    }

    if ('()'.includes(char)) {
      tokens.push({ type: 'paren', value: char });
      index++;
      continue;
    }

    if ('[]'.includes(char)) {
      tokens.push({ type: 'bracket', value: char });
      index++;
      continue;
    }

    if (char === ',') {
      tokens.push({ type: 'comma', value: char });
      index++;
      continue;
    }

    throw new Error(`Unsupported character ${char}`);
  }

  tokens.push({ type: 'eof', value: '' });
  return tokens;
}

function rowsToObjects(rows: MatrixFormulaRow[]): Record<string, unknown>[] {
  return rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const cell of row.cells ?? []) {
      if (cell.key) obj[cell.key] = cell.value;
    }
    return obj;
  });
}

function aggregateTableValues(
  rows: Record<string, unknown>[],
  key: string,
  operation: 'sum' | 'avg' | 'min' | 'max',
  formula: MatrixCellFormula,
): number {
  const values = rows
    .map((row) => parseNumeric(resolvePathValue(row, key), formula.emptyAsZero !== false))
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (!values.length) return 0;
  if (operation === 'sum') return values.reduce((acc, value) => acc + value, 0);
  if (operation === 'avg') return values.reduce((acc, value) => acc + value, 0) / values.length;
  if (operation === 'min') return Math.min(...values);
  return Math.max(...values);
}

function flattenValues(values: FormulaValue[]): FormulaPrimitive[] {
  return values.flatMap((value) => (Array.isArray(value) ? flattenValues(value) : [value]));
}

function resolvePathValue(source: Record<string, unknown>, path: string): unknown {
  if (!source || !path) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];

  return String(path)
    .split('.')
    .reduce((value: unknown, key: string) => {
      if (value == null || typeof value !== 'object') return undefined;
      return (value as Record<string, unknown>)[key];
    }, source as unknown);
}

function parseNumeric(raw: unknown, emptyAsZero: boolean): number | null {
  if (raw === null || raw === undefined || raw === '') {
    return emptyAsZero ? 0 : null;
  }
  const parsed = Number(String(raw).trim());
  if (!Number.isFinite(parsed)) {
    return emptyAsZero ? 0 : null;
  }
  return parsed;
}

function parseNumberFromText(raw: FormulaValue, fallback = 0): number {
  const text = stringValue(raw);
  const match = text.match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;

  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatExpressionResult(value: FormulaValue, formula: MatrixCellFormula): FormulaPrimitive {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return formatNumericResult(value, formula.decimals);
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value ?? '';
}

function formatNumericResult(value: number, decimals?: number): string {
  if (decimals !== undefined && decimals >= 0) {
    return value.toFixed(decimals);
  }
  const rounded = Number(value.toFixed(10));
  return String(rounded);
}

function roundNumber(value: number, decimals: number): number {
  const places = Math.max(0, Math.trunc(decimals));
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

function isZeroOrInvalidDivisor(value: number): boolean {
  return value === 0 || !Number.isFinite(value);
}

function toBoolean(value: FormulaValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim() !== '' && value.trim().toLowerCase() !== 'false';
  return !!value;
}

function stringValue(value: FormulaValue): string {
  if (Array.isArray(value)) return value.join(',');
  return String(value ?? '');
}

function shouldConcat(left: FormulaValue, right: FormulaValue): boolean {
  if (typeof left !== 'string' && typeof right !== 'string') return false;
  return Number.isNaN(Number(left)) || Number.isNaN(Number(right));
}

function compareValues(left: FormulaValue, right: FormulaValue, operator: string): boolean {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const useNumbers = Number.isFinite(leftNumber) && Number.isFinite(rightNumber);
  const comparableLeft = useNumbers ? leftNumber : stringValue(left).toLowerCase();
  const comparableRight = useNumbers ? rightNumber : stringValue(right).toLowerCase();

  if (operator === '>') return comparableLeft > comparableRight;
  if (operator === '>=') return comparableLeft >= comparableRight;
  if (operator === '<') return comparableLeft < comparableRight;
  return comparableLeft <= comparableRight;
}

function valuesEqual(left: FormulaValue, right: FormulaValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) return stringValue(left) === stringValue(right);
  return String(left ?? '').trim().toLowerCase() === String(right ?? '').trim().toLowerCase();
}
