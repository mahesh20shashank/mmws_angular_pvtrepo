import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoutinesDashboard } from './routines-dashboard';

describe('RoutinesDashboard', () => {
  let component: RoutinesDashboard;
  let fixture: ComponentFixture<RoutinesDashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutinesDashboard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoutinesDashboard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
