import { ComponentFixture, TestBed } from '@angular/core/testing';

import { StackedBarChart } from './stacked-bar-chart';

describe('StackedBarChart', () => {
  let component: StackedBarChart;
  let fixture: ComponentFixture<StackedBarChart>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StackedBarChart]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StackedBarChart);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
