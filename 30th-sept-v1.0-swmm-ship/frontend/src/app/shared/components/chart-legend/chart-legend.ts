import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

export interface LegendItem {
  label: string;
  value?: string | number;
  color: string;
}

@Component({
  selector: 'app-chart-legend',
  standalone: true,
  imports: [],
  templateUrl: './chart-legend.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './chart-legend.css',
})
export class ChartLegend {
  @Input() items: LegendItem[] = [];
  @Input() markerShape: 'dot' | 'line' = 'dot';
  @Input() layout: 'stack' | 'inline' = 'stack';
}
