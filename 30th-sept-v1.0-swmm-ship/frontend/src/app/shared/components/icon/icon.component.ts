import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';

export type IconVariant =
  | 'default'
  | 'inherit'
  | 'muted'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [LucideDynamicIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg
    [lucideIcon]="name()"
    [size]="size()"
    [strokeWidth]="strokeWidth()"
    [class]="cssClass()"
    [style.color]="color()"
  ></svg>`,
  styles: [
    `:host { display: inline-flex; align-items: center; justify-content: center; line-height: 0; }`,
  ],
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(20);
  readonly strokeWidth = input<number>(2);
  readonly variant = input<IconVariant>('default');
  readonly color = input<string | undefined>(undefined);
  readonly spin = input<boolean>(false);

  protected readonly cssClass = computed(() => {
    const classes = ['icon'];
    const variant = this.variant();
    if (variant !== 'default') classes.push(`icon--${variant}`);
    if (this.spin()) classes.push('icon--spin');
    return classes.join(' ');
  });
}
