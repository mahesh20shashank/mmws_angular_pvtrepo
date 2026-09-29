import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';
import type { EChartsCoreOption } from 'echarts/core';

/**
 * Reusable ring gauge rendered with ECharts (via ngx-echarts). `value` (0–100)
 * drives the progress arc; `centerText` is shown in the middle (defaults to
 * `value%`) with an optional `label` caption beneath it.
 */
@Component({
  selector: 'app-gauge-chart',
  standalone: true,
  imports: [NgxEchartsDirective],
  templateUrl: './gauge-chart.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './gauge-chart.css',
})
export class GaugeChart {
  /** Arc fill percentage, 0–100. */
  @Input() value = 0;
  @Input() color = '#4AA8FF';
  /** Text shown in the centre. Falls back to `value%`. */
  @Input() centerText = '';
  /** Optional caption below the centre value. */
  @Input() label = '';
  @Input() trackColor = 'rgba(255,255,255,0.08)';
  @Input() thickness = 12;
  @Input() heightPx = 130;

  get chartOption(): EChartsCoreOption {
    const text = this.centerText || `${Math.round(this.value)}%`;
    return {
      series: [
        {
          type: 'gauge',
          startAngle: 90,
          endAngle: -270,
          radius: '92%',
          center: ['50%', '50%'],
          pointer: { show: false },
          progress: { show: true, width: this.thickness, roundCap: true, itemStyle: { color: this.color } },
          axisLine: { lineStyle: { width: this.thickness, color: [[1, this.trackColor]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          anchor: { show: false },
          title: {
            show: !!this.label,
            offsetCenter: [0, '26%'],
            color: '#93a8bd',
            fontSize: 10,
            fontFamily: 'Inter, sans-serif',
          },
          detail: {
            valueAnimation: false,
            offsetCenter: [0, this.label ? '-6%' : 0],
            formatter: () => text,
            color: this.color,
            fontSize: 22,
            fontWeight: 600,
            fontFamily: 'Poppins, sans-serif',
          },
          data: [{ value: this.value, name: this.label }],
        },
      ],
    } as EChartsCoreOption;
  }
}
