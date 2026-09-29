import { ButtonComponent } from '../button/button.component';
import { Component, Input } from '@angular/core';
import { NgxEchartsDirective } from 'ngx-echarts';

@Component({
  selector: 'app-speedometer-card',
  standalone: true,
  imports: [NgxEchartsDirective, ButtonComponent],
  templateUrl: './speedometer-card.html',
})
export class SpeedometerCardComponent {

  @Input() title = 'Total Equipments';
  @Input() value = 72;

  @Input() total = 851;
@Input() operational = 751;
@Input() nonOperational = 100;

  get chartOption() {
    return {
      backgroundColor: 'transparent',

      series: [
        {
          type: 'gauge',

          startAngle: 210,
          endAngle: -30,

          min: 0,
          max: 100,

          radius: '100%',

          center: ['50%', '60%'],

          progress: {
            show: true,
            roundCap: true,
            width: 10,
            itemStyle: {
              color: '#49ffd4',
              shadowBlur: 10,
              shadowColor: 'rgba(73,255,212,0.5)'
            }
          },

          axisLine: {
            roundCap: true,
            lineStyle: {
              width: 10,
              color: [
                [0.7, '#49ffd4'],
                [0.9, '#ffb84d'],
                [1, '#ff4d6d']
              ]
            }
          },

          pointer: {
            show: false
          },

          splitLine: {
            show: false
          },

          axisTick: {
            show: false
          },

          axisLabel: {
            show: false
          },

          detail: {
            valueAnimation: true,
            offsetCenter: [0, '65%'],
            formatter: '{value}',
            color: '#ffffff',
            fontSize: 18,
            fontWeight: 700
          },

          title: {
            offsetCenter: [0, '95%'],
            color: 'rgba(255,255,255,0.6)',
            fontSize: 11
          },

          data: [
            {
              value: this.value,
              name: 'OPS Score'
            }
          ]
        }
      ]
    };
  }
}
