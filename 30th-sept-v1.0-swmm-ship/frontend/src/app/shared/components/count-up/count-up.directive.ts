import { Directive, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, inject } from "@angular/core";

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

@Directive({
  selector: "[appCountUp]",
  standalone: true,
})
export class CountUpDirective implements OnChanges, OnDestroy {
  @Input("appCountUp") value: string | number = "";
  @Input() countUpDuration = 700;

  private readonly el = inject(ElementRef<HTMLElement>);
  private frame?: number;

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes["value"]) return;
    this.animate(changes["value"].previousValue, this.value);
  }

  ngOnDestroy(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
  }

  private animate(previous: unknown, next: string | number): void {
    const nextStr = next === null || next === undefined ? "" : String(next);
    const matches = [...nextStr.matchAll(NUMBER_RE)];

    if (this.frame !== undefined) cancelAnimationFrame(this.frame);

    if (matches.length === 0) {
      this.el.nativeElement.textContent = nextStr;
      return;
    }

    const prevStr = previous === null || previous === undefined ? "" : String(previous);
    const prevMatches = [...prevStr.matchAll(NUMBER_RE)];

    const targets = matches.map((m) => parseFloat(m[0].replace(/,/g, "")));
    const starts = matches.map((m, i) => {
      const prev = prevMatches[i];
      return prev ? parseFloat(prev[0].replace(/,/g, "")) : 0;
    });
    const decimals = matches.map((m) => {
      const dot = m[0].match(/\.(\d+)$/);
      return dot ? dot[1].length : 0;
    });

    // Static text surrounding/between the numeric tokens, e.g. ["", "/", "%"] for "620/624%".
    const parts: string[] = [];
    let lastIndex = 0;
    matches.forEach((m) => {
      parts.push(nextStr.slice(lastIndex, m.index));
      lastIndex = m.index! + m[0].length;
    });
    parts.push(nextStr.slice(lastIndex));

    const startTime = performance.now();
    const duration = this.countUpDuration;

    const format = (n: number, d: number) =>
      d > 0
        ? n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
        : Math.round(n).toLocaleString("en-US");

    const render = (values: number[]) => {
      let result = parts[0];
      values.forEach((v, i) => {
        result += format(v, decimals[i]) + parts[i + 1];
      });
      this.el.nativeElement.textContent = result;
    };

    const step = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      render(starts.map((start, i) => start + (targets[i] - start) * eased));

      if (t < 1) {
        this.frame = requestAnimationFrame(step);
      } else {
        this.el.nativeElement.textContent = nextStr;
      }
    };

    this.frame = requestAnimationFrame(step);
  }
}
