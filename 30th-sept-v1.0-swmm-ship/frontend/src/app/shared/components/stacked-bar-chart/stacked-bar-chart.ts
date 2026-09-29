import { ButtonComponent } from '../button/button.component';

import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ChartData,
  ChartOptions,
  ChartType,
  registerables,
  Chart
} from 'chart.js';
import { BaseChartDirective } from 'ng2-charts';
import { DateWheelPicker } from '../date-wheel-picker/date-wheel-picker';
Chart.register(...registerables);

/** First segment in a stack gets rounded bottom corners, last gets rounded top corners
 *  (so the visible outer edges of the combined stack are rounded), everything between is square. */
function stackSegmentBorderRadius(index: number, total: number) {
  if (index === 0) return { topLeft: 0, topRight: 0, bottomLeft: 4, bottomRight: 4 };
  if (index === total - 1) return { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 };
  return 0;
}

@Component({
  selector: 'app-stacked-bar-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, DateWheelPicker, ButtonComponent],
  templateUrl: './stacked-bar-chart.html'
})
export class StackedBarChart implements OnChanges {

  @Input() title = 'Department Status';

  @Input() chartData: {
    month: string;
    oms: number;
    aft: number;
    fwd: number;
  }[] = [];

  chartType: ChartType = 'bar';

  activeFilter: '6m' | '1y' | 'custom' = '6m';
  showDatePicker = false;
  fromDate = '';
  toDate = '';

  // Labels derived from input
  get labels(): string[] {
    return this.chartData.map(d => d.month);
  }

// if selected date is custome then open the date picker
  selectFilter(type: '6m' | '1y' | 'custom') {
  this.activeFilter = type;

  if (type === 'custom') {
    this.showDatePicker = true;
  } else {
    this.showDatePicker = false;
  }
  }
  // select the date range
  onDateRangeSelected(event: { from: string; to: string }) {
  this.fromDate = event.from;
  this.toDate = event.to;

  this.showDatePicker = false;
}

closeFiler(){
  this.showDatePicker = false
}


get customDateLabel(): string {

  if (!this.fromDate || !this.toDate) {
    return 'Custom Date';
  }

  // return `${this.fromDate} - ${this.toDate}`;
  return `Custom Date`;
}

  // Raw dataset definitions
  get rawDatasets() {
    return [
      {
        label: 'FWD Engine Room',
        data: this.chartData.map(d => d.fwd),
        backgroundColor: '#1D74D3',
        borderColor: '#1D74D3',
        color: '#1D74D3'
      },
      {
        label: 'AFT Engine Room',
        data: this.chartData.map(d => d.aft),
        backgroundColor: '#82C3FF',
        borderColor: '#82C3FF',
        color: '#82C3FF'
      },
      {
        label: 'OMS',
        data: this.chartData.map(d => d.oms),
        backgroundColor: '#E5F1FF',
        borderColor: '#E5F1FF',
        color: '#E5F1FF'
      }
    ];
  }

  // Pie data: category labels + summed totals
  get pieLabels(): string[] {
    return this.rawDatasets.map(d => d.label);
  }

  get pieTotals(): number[] {
    return this.rawDatasets.map(d =>
      (d.data as number[]).reduce((a, b) => a + b, 0)
    );
  }

  get grandTotal(): number {
    return this.pieTotals.reduce((a, b) => a + b, 0);
  }

  // Pie legend items with computed percentages
  get pieLegendItems(): { label: string; value: number; pct: string; color: string }[] {
    return this.rawDatasets.map((d, i) => ({
      label: d.label,
      value: this.pieTotals[i],
      pct: ((this.pieTotals[i] / this.grandTotal) * 100).toFixed(2) + '%',
      color: d.color
    }));
  }

  // Chart.js data object
  // Chart.js options/data shape differs per chart type ('bar' | 'line' | 'pie'),
  // and buildChart() below reassigns this to a type-specific ChartData/ChartOptions
  // literal at runtime, so a single ChartType-parameterized generic cannot type
  // this field without breaking assignability from any of the concrete variants.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeChartData: ChartData<any> = {
  labels: [],
  datasets: []
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
activeChartOptions: ChartOptions<any> = {};

  ngOnChanges(): void {
    this.buildChart(this.chartType);
  }

  changeChartType(type: ChartType): void {
    this.chartType = type;
    this.buildChart(type);
  }

  private buildChart(type: ChartType): void {
    if (type === 'pie') {
      this.activeChartData = {
        labels: this.pieLabels,
        datasets: [
          {
            data: this.pieTotals,
            backgroundColor: this.rawDatasets.map(d => d.backgroundColor),
            borderWidth: 0,
            hoverOffset: 6
          }
        ]
      };

      this.activeChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '0%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#fff',
            bodyColor: '#fff',
            callbacks: {
              label: (ctx) => {
                const val = ctx.parsed as number;
                const pct = ((val / this.grandTotal) * 100).toFixed(2);
                return ` ${val}  ${pct}%`;
              }
            }
          }
        }
      } as ChartOptions<'pie'>;

    } else if (type === 'line') {
      this.activeChartData = {
        labels: this.labels,
        datasets: this.rawDatasets.map(d => ({
          ...d,
          fill: false,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 7,
          borderWidth: 2,
          pointBackgroundColor: d.borderColor
        }))
      };

      this.activeChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#fff',
            bodyColor: '#fff'
          }
        },
        scales: {
          x: {
            stacked: false,
            ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.08)' },
            border: { display: false }
          },
          y: {
            stacked: false,
            min: 0,
            ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.08)' },
            border: { display: false }
          }
        }
      } as ChartOptions<'line'>;

    } else {
      // BAR (stacked)
      this.activeChartData = {
        labels: this.labels,
        datasets: this.rawDatasets.map((d, i) => ({
          label: d.label,
          data: d.data,
          backgroundColor: d.backgroundColor,
          stack: 'combined',
          barThickness: 28,
          borderRadius: stackSegmentBorderRadius(i, this.rawDatasets.length)
        }))
      };

      this.activeChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#111827',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
            border: { display: false }
          },
          y: {
            stacked: true,
            min: 0,
            max: 200,
            ticks: { stepSize: 40, color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
            grid: { color: 'rgba(255,255,255,0.08)' },
            border: { display: false }
          }
        },
        animation: { duration: 600 }
      } as ChartOptions<'bar'>;
    }
  }
}
