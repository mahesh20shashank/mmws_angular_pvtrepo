import { DOCUMENT } from "@angular/common";
import {
  Injectable,
  Renderer2,
  RendererFactory2,
  inject,
} from "@angular/core";

type TooltipSide = "top" | "bottom" | "left" | "right";

/**
 * App-wide styled tooltip. Instead of a per-element directive, this attaches a
 * few delegated listeners to the document **once** (call {@link init} at
 * bootstrap) and upgrades the native `title` attribute of ANY element the user
 * hovers/focuses — buttons, tabs, icons, ag-grid cells, dynamically-added
 * nodes, everything — with zero per-component wiring.
 *
 * It borrows the element's `title` on enter (removing it to suppress the
 * browser's own tooltip) and restores it on leave. The bubble is a single node
 * appended to <body>; styling lives in the global `.app-tooltip` rules in
 * src/styles.css, mirroring the landing-page sidebar `.nav-tooltip`.
 */
@Injectable({ providedIn: "root" })
export class TooltipService {
  private readonly doc = inject(DOCUMENT);
  private readonly renderer: Renderer2 = inject(RendererFactory2).createRenderer(
    null,
    null,
  );

  private tip: HTMLElement | null = null;
  private labelEl: HTMLElement | null = null;

  /** Element whose tooltip is currently shown. */
  private activeEl: HTMLElement | null = null;
  private stashedTitle: string | null = null;
  /** True only when we removed `title` (pointer hover) and must put it back. */
  private borrowed = false;
  private started = false;

  init(): void {
    if (this.started) return;
    const view = this.doc.defaultView;
    if (!view) return; // e.g. server-side rendering — no DOM
    this.started = true;

    // Capture phase so we also see events from elements that stop propagation.
    view.addEventListener("mouseover", this.onEnter, true);
    view.addEventListener("mouseout", this.onLeave, true);
    view.addEventListener("focusin", this.onEnter, true);
    view.addEventListener("focusout", this.onLeave, true);
    // The anchor may move out from under a shown tooltip — dismiss on all of these.
    view.addEventListener("scroll", this.dismiss, true);
    view.addEventListener("resize", this.dismiss);
    view.addEventListener("click", this.dismiss, true);
  }

  private readonly onEnter = (event: Event): void => {
    const start = event.target as HTMLElement | null;
    if (!start || typeof start.closest !== "function") return;

    const el = start.closest<HTMLElement>("[title]");
    if (!el || el === this.activeEl) return;

    // Skip Angular component hosts (custom elements — any tag with a hyphen,
    // e.g. <app-panel-card title="Alerts">). Their `title` is a leaked @Input,
    // not a real tooltip. Strip it so neither our bubble nor the browser's
    // native tooltip appears on cards; the component already has its value.
    if (el.tagName.includes("-")) {
      el.removeAttribute("title");
      return;
    }

    const text = el.getAttribute("title");
    if (!text) return; // empty title → nothing to show

    this.dismiss(); // restore any previously borrowed title first
    this.activeEl = el;
    this.stashedTitle = text;
    // Borrow (remove) `title` only on pointer hover — that's the only case the
    // browser paints its own tooltip. On keyboard focus we keep `title` so
    // screen readers still announce it.
    if (event.type === "mouseover") {
      el.removeAttribute("title");
      this.borrowed = true;
    }
    this.render(el, text);
  };

  private readonly onLeave = (event: Event): void => {
    if (!this.activeEl) return;
    const to = (event as MouseEvent | FocusEvent).relatedTarget as Node | null;
    if (to && this.activeEl.contains(to)) return; // still inside the same element
    this.dismiss();
  };

  /** Restore the borrowed title (if any) and hide the bubble. */
  private readonly dismiss = (): void => {
    if (this.activeEl && this.borrowed && this.stashedTitle !== null) {
      this.renderer.setAttribute(this.activeEl, "title", this.stashedTitle);
    }
    this.activeEl = null;
    this.stashedTitle = null;
    this.borrowed = false;
    if (this.tip) this.renderer.removeClass(this.tip, "app-tooltip--show");
  };

  private ensureElement(): void {
    if (this.tip) return;

    const tip = this.renderer.createElement("div") as HTMLElement;
    this.renderer.addClass(tip, "app-tooltip");
    this.renderer.setAttribute(tip, "role", "tooltip");

    const label = this.renderer.createElement("span") as HTMLElement;
    this.renderer.addClass(label, "app-tooltip__label");

    const arrow = this.renderer.createElement("span") as HTMLElement;
    this.renderer.addClass(arrow, "app-tooltip__arrow");

    this.renderer.appendChild(tip, label);
    this.renderer.appendChild(tip, arrow);
    this.renderer.appendChild(this.doc.body, tip);

    this.tip = tip;
    this.labelEl = label;
  }

  private render(host: HTMLElement, text: string): void {
    this.ensureElement();
    if (!this.tip) return;
    this.labelEl!.textContent = text;
    this.position(host);
    this.renderer.addClass(this.tip, "app-tooltip--show");
  }

  private position(host: HTMLElement): void {
    const tip = this.tip!;
    const r = host.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const gap = 10;
    const vw = this.doc.documentElement.clientWidth;
    const vh = this.doc.documentElement.clientHeight;

    const roomRight = r.right + tw + gap <= vw;
    const roomAbove = r.top - th - gap >= 0;

    // Left-hand rails (main sidebar, report navigator) fly out to the RIGHT,
    // like the landing sidebar. Everything else prefers above, then below.
    let side: TooltipSide;
    if (r.left < vw * 0.2 && roomRight) {
      side = "right";
    } else if (!roomAbove) {
      side = r.bottom + th + gap <= vh ? "bottom" : "right";
    } else {
      side = "top";
    }

    let left: number;
    let top: number;
    switch (side) {
      case "bottom":
        left = r.left + r.width / 2 - tw / 2;
        top = r.bottom + gap;
        break;
      case "right":
        left = r.right + gap;
        top = r.top + r.height / 2 - th / 2;
        break;
      case "top":
      default:
        left = r.left + r.width / 2 - tw / 2;
        top = r.top - th - gap;
        break;
    }

    // Keep inside the viewport.
    left = Math.max(gap, Math.min(left, vw - tw - gap));
    top = Math.max(gap, Math.min(top, vh - th - gap));

    this.renderer.setStyle(tip, "left", `${left}px`);
    this.renderer.setStyle(tip, "top", `${top}px`);
    this.renderer.setAttribute(tip, "data-side", side); // drives the arrow CSS
  }
}
