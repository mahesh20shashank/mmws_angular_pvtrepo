import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpMaintenanceDashboard } from './op-maintenance-dashboard';

describe('OpMaintenanceDashboard', () => {
  let component: OpMaintenanceDashboard;
  let fixture: ComponentFixture<OpMaintenanceDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpMaintenanceDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpMaintenanceDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
