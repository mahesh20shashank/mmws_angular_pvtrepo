import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, ViewChild, OnInit } from '@angular/core';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData, ChartType } from 'chart.js';
import { FormsModule } from '@angular/forms';

import {
  Chart,
  BarController,
  LineController,
  PieController,
  DoughnutController,
  RadarController,
  ScatterController,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Legend,
  Tooltip
} from 'chart.js';

Chart.register(
  BarController, LineController, PieController, DoughnutController,
  RadarController, ScatterController, CategoryScale, LinearScale,
  RadialLinearScale, PointElement, LineElement, BarElement, ArcElement,
  Legend, Tooltip
);

interface ChartDatasetConfig {
  key: string;
  label: string;
  color?: string;
}

interface DynamicChartDataset {
  label: string;
  data: number[];
  borderColor: string;
  backgroundColor: string;
  borderWidth: number;
  pointBackgroundColor: string;
  pointBorderColor: string;
  pointRadius: number;
  pointHoverRadius: number;
  fill: boolean;
  tension: number;
  borderDash?: number[];
}

@Component({
  selector: 'app-dynamic-chart',
  standalone: true,
  imports: [CommonModule, BaseChartDirective, FormsModule],
  template: `
    <div class="rounded-lg border border-white/15 bg-[#0d2438] p-3">
      <div class="mb-4 flex items-center justify-between gap-3 ">
        <h3 class="head3">{{ chartTitle }}</h3>
        <select
          [ngModel]="selectedType"
          (ngModelChange)="onChartTypeChange($event)"
          class="cursor-pointer rounded-md border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white outline-none focus:border-[#61C2FF]"
        >
          <option value="bar">📊 Bar Chart</option>
          <option value="line">📈 Line Chart</option>
          <option value="dashedLine">--- Dashed Line Chart</option>
          <option value="pie">🥧 Pie Chart</option>
          <option value="doughnut">🍩 Doughnut Chart</option>
          <option value="radar">📡 Radar Chart</option>
        </select>
      </div>

      <div class="h-[450px]">
        <canvas
          *ngIf="hasValidData"
          baseChart
          [data]="chartData"
          [type]="currentChartType"
          [options]="chartOptions"
        ></canvas>
      </div>

      <div *ngIf="!hasValidData" class="py-4 text-center text-sm text-white/60">
        No data available. Please enter values in the table.
      </div>
    </div>
  `
})
export class DynamicChartComponent implements OnChanges, OnInit {
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  @Input() tableData: any[] = [];
  @Input() chartConfig: any = {};

  selectedType = 'bar';
  currentChartType: ChartType = 'bar';
  chartTitle = 'Chart';
  hasValidData = false;

  chartData: ChartData = { labels: [], datasets: [] };

  chartOptions: ChartConfiguration['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      tooltip: { enabled: true }
    }
  };

  ngOnInit(): void {
    this.selectedType = this.chartConfig?.type || 'bar';
    this.currentChartType = (this.selectedType === 'dashedLine' ? 'line' : this.selectedType) as ChartType;
    this.chartTitle = this.chartConfig?.title || 'Chart';
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tableData']) {
      this.updateChart();
    }
  }

  onChartTypeChange(newType: string): void {
    this.selectedType = newType;
    this.currentChartType = (newType === 'dashedLine' ? 'line' : newType) as ChartType;
    this.updateChart();
  }

  private extractNumericValue(value: any): number {
    if (value === undefined || value === null || value === '') return 0;
    if (typeof value === 'number') return value;
    const str = String(value);
    const match = str.match(/(\d+(?:\.\d+)?)/);
    if (match) return parseFloat(match[1]);
    return 0;
  }

  private readonly defaultDatasetConfigs: ChartDatasetConfig[] = [
    { key: 'specified_value', label: 'Specified Value', color: '#ef4444' },
    { key: 'last_measured', label: 'Last Measured Value', color: '#f59e0b' },
    { key: 'present_value', label: 'Present Value', color: '#3b82f6' },
  ];

  private updateChart(): void {
    if (!this.tableData || this.tableData.length === 0) {
      this.hasValidData = false;
      return;
    }

    const labelKey = this.chartConfig?.labelKey || 'parameter';
    const datasetConfigs =
      this.chartConfig?.datasets?.length > 0
        ? this.chartConfig.datasets
        : this.defaultDatasetConfigs;

    const labels: string[] = [];
    this.tableData.forEach((row) => {
      const label = row[labelKey];
      if (label !== undefined && label !== null && String(label).trim() !== '') {
        labels.push(String(label));
      }
    });

    if (labels.length === 0) {
      this.hasValidData = false;
      return;
    }

    this.hasValidData = true;

    const fallbackSpecified = this.tableData.reduce((acc, row) => {
      const v = this.extractNumericValue(row.specified_value);
      return v > 0 ? v : acc;
    }, 0);

    const isLine = this.selectedType === 'line' || this.selectedType === 'dashedLine';
    const datasets: DynamicChartDataset[] = datasetConfigs.map((cfg: ChartDatasetConfig) => {
      const color = cfg.color || '#3b82f6';
      return {
        label: cfg.label,
        data: this.tableData.map((row) => {
          const v = this.extractNumericValue(row[cfg.key]);
          if (cfg.key === 'specified_value' && v === 0 && fallbackSpecified > 0) {
            return fallbackSpecified;
          }
          return v;
        }),
        borderColor: color,
        backgroundColor: isLine ? 'transparent' : color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: '#fff',
        pointRadius: 5,
        pointHoverRadius: 7,
        fill: !isLine,
        tension: 0.3,
      };
    });

    if (this.selectedType === 'dashedLine') {
      datasets.forEach((ds: DynamicChartDataset) => {
        ds.borderDash = [10, 5];
      });
    }

    this.chartData = { labels, datasets };

    if (this.chart) {
      this.chart.chart?.update();
    }
  }
}
