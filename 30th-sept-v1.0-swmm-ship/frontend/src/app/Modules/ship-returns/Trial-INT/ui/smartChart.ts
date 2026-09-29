import {
    AfterViewInit,
    Component,
    ElementRef,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    Output,
    SimpleChanges,
    ViewChild
  } from '@angular/core';
  import { CommonModule } from '@angular/common';
  import {
    Chart,
    ChartConfiguration,
    ChartData,
    ChartOptions,
    ChartType,
    registerables
  } from 'chart.js';

  Chart.register(...registerables);

  export type SmartGraphType =
    | 'bar'
    | 'grouped-bar'
    | 'stacked-bar'
    | 'horizontal-bar'
    | 'stacked-horizontal-bar'
    | 'line'
    | 'pie'
    | 'doughnut'
    | 'timeline';

  export interface SmartGraphSeries {
    label: string;
    dataKey: string;
    stack?: string;
  }

  export interface SmartGraphConfig {
    chartId: string;
    title: string;
    subtitle?: string;
    badge?: string;

    type: SmartGraphType;

    labelKey?: string;
    valueKey?: string;

    xAxisTitle?: string;
    yAxisTitle?: string;

    series?: SmartGraphSeries[];

    data: any[];

    containerHeight?: number;

    scroll?: {
      enabled: boolean;
      minHeightPerItem?: number;
      maxVisibleItems?: number;
    };

    legend?: boolean;
    dataLabels?: boolean;

    drillDown?: {
      enabled: boolean;
      route?: string;
    };
  }

  @Component({
    selector: 'app-smart-graph',
    standalone: true,
    imports: [CommonModule],
    template:`
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-white/15 bg-[#0d2438]">
  <!-- Header -->
   <div class="flex shrink-0 items-start justify-between gap-3 border-b border-white/15 p-2">
    <div>
      <h3 *ngIf="config?.title" class="heading-card !text-base">
        {{ config?.title }}
      </h3>

       <p *ngIf="config?.subtitle" class="content-inter mt-2 !text-xs !text-white/60">
        {{ config?.subtitle }}
      </p>
    </div>

     <div *ngIf="config?.badge" class="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white/80">
      {{ config.badge }}
    </div>
  </div>

  <!-- Chart Body -->
  <div
    class="relative min-h-0 flex-1 p-3"
    [style.height.px]="config?.containerHeight || 360"
  >
    <div
      class="h-full w-full"
      [class.overflow-y-auto]="config?.scroll?.enabled"
      [class.pr-2]="config.scroll?.enabled"
      [style.max-height.px]="computedScrollViewportHeight"
    >
      <div
        class="relative w-full"
        [style.height.px]="computedCanvasHeight"
      >
        <canvas #chartCanvas></canvas>
      </div>
    </div>

    <!-- Empty State -->
    <div
      *ngIf="!hasData"
       class="absolute inset-5 flex items-center justify-center rounded-lg border border-white/15 bg-[#0a1929]/90 text-sm font-semibold text-white/60"
    >
      No data available
    </div>
  </div>
</div>
    `
  })
  export class SmartGraphComponent implements AfterViewInit, OnChanges, OnDestroy {
    @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

    @Input() config!: SmartGraphConfig;

    @Output() graphClick = new EventEmitter<any>();

    chart!: Chart;

    hasData = true;
    computedCanvasHeight = 320;
    computedScrollViewportHeight: number | null = null;

    private navyColors = [
      '#ff9f35', // Orange
      '#9568c9', // Purple
      '#459c55', // Green
      '#4f8edc', // Blue
      '#39b8cf', // Cyan
      '#e4d000', // Yellow
      '#b4b4b4', // Grey
      '#bd59ad', // Pink / Magenta
      '#956b23', // Brown
      '#f24f50', // Red
    ];

    ngAfterViewInit(): void {
      this.renderChart();
    }

  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['config']) return;
    if (this.chartCanvas) {
      this.renderChart();
      return;
    }
    setTimeout(() => {
      if (this.chartCanvas) this.renderChart();
    });
  }

    ngOnDestroy(): void {
      this.destroyChart();
    }

    private renderChart(): void {
      if (!this.config || !this.chartCanvas) return;

      this.destroyChart();

      const data = this.config.data || [];
      this.hasData = data.length > 0;

      this.setCanvasHeight(data);

      const chartType = this.getChartJsType();
      const chartData = this.buildChartData(data);
      const chartOptions = this.buildChartOptions();

      const chartConfig: ChartConfiguration = {
        type: chartType,
        data: chartData,
        options: chartOptions,
        plugins: this.shouldShowValueLabels() ? [this.valueLabelPlugin()] : []
      };

      this.chart = new Chart(this.chartCanvas.nativeElement, chartConfig);
    }

    private destroyChart(): void {
      if (this.chart) {
        this.chart.destroy();
      }
    }

    private getChartJsType(): ChartType {
      if (this.config.type === 'pie') return 'pie';
      if (this.config.type === 'doughnut') return 'doughnut';
      if (this.config.type === 'line') return 'line';

      return 'bar';
    }

    private buildChartData(data: any[]): ChartData {
      if (this.config.type === 'pie' || this.config.type === 'doughnut') {
        return this.buildPieData(data);
      }

      if (this.config.type === 'timeline') {
        return this.buildTimelineData(data);
      }

      return this.buildNormalData(data);
    }

    private buildNormalData(data: any[]): ChartData {
      const labelKey = this.config.labelKey || 'label';
      const isStacked = this.isStackedChart();

      const labels = data.map(item => item[labelKey]);

      const series = this.config.series?.length
        ? this.config.series
        : [
            {
              label: 'Value',
              dataKey: this.config.valueKey || 'value'
            }
          ];

      const datasets = series.map((s, index) => ({
        label: s.label,
        data: data.map(item => Number(item[s.dataKey] || 0)),
        backgroundColor: this.getColor(index, 0.85),
        borderColor: this.getColor(index, 1),
        borderWidth: 1,
        borderRadius: 4,
        maxBarThickness: this.isHorizontal() ? 22 : 42,
        stack: isStacked ? s.stack || 'default' : s.stack,
        tension: 0.35,
        fill: false
      }));

      return {
        labels,
        datasets
      };
    }

    private buildPieData(data: any[]): ChartData {
      const labelKey = this.config.labelKey || 'label';
      const valueKey = this.config.valueKey || 'value';

      return {
        labels: data.map(item => item[labelKey]),
        datasets: [
          {
            label: this.config.title,
            data: data.map(item => Number(item[valueKey] || 0)),
            backgroundColor: data.map((_, index) => this.getColor(index, 0.85)),
            borderColor: '#ffffff',
            borderWidth: 2
          }
        ]
      };
    }

    private buildTimelineData(data: any[]): ChartData {
      return {
        labels: data.map(item => item.label),
        datasets: [
          {
            label: 'Timeline',
            data: data.map(item => [
              new Date(item.start).getTime(),
              new Date(item.end).getTime()
            ]),
            backgroundColor: data.map((item, index) => {
              if (String(item.status || '').toLowerCase().includes('refit')) {
                return 'rgba(240, 162, 46, 0.85)';
              }

              if (String(item.status || '').toLowerCase().includes('critical')) {
                return 'rgba(201, 72, 80, 0.85)';
              }

              return this.getColor(index, 0.75);
            }),
            borderColor: data.map((_, index) => this.getColor(index, 1)),
            borderWidth: 1,
            borderRadius: 4,
            barThickness: 18
          }
        ]
      };
    }

    private buildChartOptions(): ChartOptions {
      const isStacked = this.isStackedChart();

      const isTimeline = this.config.type === 'timeline';
      const isCircular = this.isCircularChart();
       const textPrimary = '#f8fafc';
       const textSecondary = '#cbd5e1';
       const dividerSoft = 'rgba(148, 163, 184, 0.18)';
       const tooltipBg = 'rgba(15, 23, 42, 0.95)';

      const options: ChartOptions = {
        responsive: true,
        maintainAspectRatio: false,

        indexAxis: this.isHorizontal() || isTimeline ? 'y' : 'x',

        layout: {
          padding: isCircular
            ? {
                top: 24,
                right: 78,
                bottom: 18,
                left: 78
              }
            : 0
        },

        onClick: (_event, elements) => {
          if (!elements?.length || !this.config?.drillDown?.enabled) return;

          const element: any = elements[0];
          const dataIndex = element.index;
          const datasetIndex = element.datasetIndex;

          const raw = this.config.data[dataIndex];
          const dataset = this.chart.data.datasets[datasetIndex];

          this.graphClick.emit({
            chartId: this.config.chartId,
            chartType: this.config.type,
            row: raw,
            label: this.chart.data.labels?.[dataIndex],
            seriesName: dataset?.label,
            dataIndex,
            datasetIndex,
            route: this.config.drillDown?.route
          });
        },

        plugins: {
          legend: {
            display: this.config.legend !== false,
            position: isCircular ? 'left' : 'top',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              color: textSecondary,
              font: {
                size: 11,
                weight: 'bold'
              }
            }
          },

          tooltip: {
            enabled: true,
            backgroundColor: tooltipBg,
            titleColor: textPrimary,
            bodyColor: textPrimary,
            padding: 10,
            callbacks: {
              label: (context: any) => {
                if (isTimeline) {
                  const row = this.config.data[context.dataIndex];
                  return `${row.status || 'Period'}: ${row.start} to ${row.end}`;
                }

                if (isCircular) {
                  return `${context.label}: ${context.raw}`;
                }

                const label = context.dataset.label || '';
                const value = context.raw;
                return `${label}: ${value}`;
              }
            }
          }
        },

        scales:
          this.config.type === 'pie' || this.config.type === 'doughnut'
            ? {}
            : {
                x: {
                  stacked: isStacked,
                  grid: {
                    color: dividerSoft
                  },
                  ticks: {
                    color: textSecondary,
                    font: {
                      size: 10,
                      weight: 'bold'
                    },
                    callback: isTimeline
                      ? (value: any) => this.formatDateTick(Number(value))
                      : undefined
                  },
                  title: {
                    display: !!this.config.xAxisTitle,
                    text: this.config.xAxisTitle,
                    color: textPrimary,
                    font: {
                      size: 11,
                      weight: 'bold'
                    }
                  }
                },
                y: {
                  stacked: isStacked,
                  grid: {
                    color: dividerSoft
                  },
                  ticks: {
                    color: textSecondary,
                    font: {
                      size: 10,
                      weight: 'bold'
                    }
                  },
                  title: {
                    display: !!this.config.yAxisTitle,
                    text: this.config.yAxisTitle,
                    color: textPrimary,
                    font: {
                      size: 11,
                      weight: 'bold'
                    }
                  }
                }
              }
      };

      return options;
    }

    private getThemeColor(token: string, fallback: string): string {
      if (typeof document === 'undefined') return fallback;

      return getComputedStyle(document.documentElement)
        .getPropertyValue(token)
        .trim() || fallback;
    }

    private isHorizontal(): boolean {
      return (
        this.config.type === 'horizontal-bar' ||
        this.config.type === 'stacked-horizontal-bar'
      );
    }

    private isStackedChart(): boolean {
      return (
        this.config.type === 'stacked-bar' ||
        this.config.type === 'stacked-horizontal-bar'
      );
    }

    private isCircularChart(): boolean {
      return this.config.type === 'pie' || this.config.type === 'doughnut';
    }

    private shouldShowValueLabels(): boolean {
      return this.config.dataLabels === true || this.config.type === 'pie';
    }

    private setCanvasHeight(data: any[]): void {
      const containerHeight = this.config.containerHeight || 360;
      const defaultHeight = containerHeight - 45;
      this.computedScrollViewportHeight = null;

      if (!this.config.scroll?.enabled) {
        this.computedCanvasHeight = defaultHeight;
        return;
      }

      const itemHeight = this.config.scroll.minHeightPerItem || 34;
      const maxVisibleItems = this.config.scroll.maxVisibleItems;
      this.computedScrollViewportHeight = maxVisibleItems
        ? Math.min(defaultHeight, maxVisibleItems * itemHeight)
        : null;

      const calculatedHeight = Math.max(defaultHeight, data.length * itemHeight);

      this.computedCanvasHeight = calculatedHeight;
    }

    private getColor(index: number, opacity = 1): string {
      const hex = this.navyColors[index % this.navyColors.length];

      const bigint = parseInt(hex.replace('#', ''), 16);
      const r = (bigint >> 16) & 255;
      const g = (bigint >> 8) & 255;
      const b = bigint & 255;

      return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }

    private formatDateTick(value: number): string {
      if (!value) return '';

      const date = new Date(value);

      return date.toLocaleDateString('en-GB', {
        month: 'short',
        year: '2-digit'
      });
    }

    private valueLabelPlugin(): any {
      return {
        id: 'smartValueLabels',
        afterDatasetsDraw: (chart: Chart) => {
          if (this.isCircularChart()) {
            this.drawCircularValueLabels(chart);
            return;
          }

          const { ctx } = chart;

          ctx.save();
          ctx.font = 'bold 10px Arial';
          ctx.fillStyle = '#0f172a';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
            const meta = chart.getDatasetMeta(datasetIndex);

            meta.data.forEach((bar: any, index: number) => {
              const value = dataset.data[index];

              if (Array.isArray(value)) return;

              const position = bar.tooltipPosition();

              if (this.isHorizontal()) {
                ctx.textAlign = 'left';
                ctx.fillText(String(value), position.x + 8, position.y);
              } else {
                ctx.textAlign = 'center';
                ctx.fillText(String(value), position.x, position.y - 10);
              }
            });
          });

          ctx.restore();
        }
      };
    }

    private drawCircularValueLabels(chart: Chart): void {
      const { ctx } = chart;
      const textPrimary = '#0f172a';
      const textSecondary = '#64748b';

      ctx.save();
      ctx.font = '600 11px Arial';
      ctx.fillStyle = textPrimary;
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 1.5;

      chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
        const meta = chart.getDatasetMeta(datasetIndex);

        meta.data.forEach((arc: any, index: number) => {
          const value = dataset.data[index];
          const numericValue = Number(value || 0);

          if (!numericValue || !arc?.outerRadius) return;

          const label = String(chart.data.labels?.[index] ?? '');
          const middleAngle = (arc.startAngle + arc.endAngle) / 2;
          const direction = Math.cos(middleAngle) >= 0 ? 1 : -1;
          const edgeX = arc.x + Math.cos(middleAngle) * arc.outerRadius;
          const edgeY = arc.y + Math.sin(middleAngle) * arc.outerRadius;
          const elbowX = arc.x + Math.cos(middleAngle) * (arc.outerRadius + 12);
          const elbowY = arc.y + Math.sin(middleAngle) * (arc.outerRadius + 12);
          const lineEndX = elbowX + direction * 18;
          const textX = lineEndX + direction * 6;
          const text = `${label}: ${numericValue}`;
          const maxTextWidth = direction > 0
            ? Math.max(36, chart.width - textX - 8)
            : Math.max(36, textX - 8);
          const backgroundColor = Array.isArray(dataset.backgroundColor)
            ? dataset.backgroundColor[index]
            : dataset.backgroundColor;

          ctx.strokeStyle = backgroundColor || textSecondary;
          ctx.beginPath();
          ctx.moveTo(edgeX, edgeY);
          ctx.lineTo(elbowX, elbowY);
          ctx.lineTo(lineEndX, elbowY);
          ctx.stroke();

          ctx.textAlign = direction > 0 ? 'left' : 'right';
          ctx.fillStyle = textPrimary;
          ctx.fillText(text, textX, elbowY, maxTextWidth);
        });
      });

      ctx.restore();
    }
  }
