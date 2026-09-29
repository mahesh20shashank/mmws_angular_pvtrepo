import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * SVG icon registry. Usage: <app-icon name="bell" [size]="16" />
 * Add new icons by extending the @switch in this template.
 */
@Component({
  selector: 'app-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner-icon.component.html',

  styles: [':host { display: inline-grid; place-items: center; line-height: 0; }'],
})
export class IconComponent {
  readonly name = input.required<string>();
  readonly size = input<number>(16);
}
