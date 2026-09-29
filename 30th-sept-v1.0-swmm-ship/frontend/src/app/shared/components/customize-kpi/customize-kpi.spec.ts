import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CustomizeKpi } from './customize-kpi';

describe('CustomizeKpi', () => {
  let component: CustomizeKpi;
  let fixture: ComponentFixture<CustomizeKpi>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CustomizeKpi]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CustomizeKpi);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
