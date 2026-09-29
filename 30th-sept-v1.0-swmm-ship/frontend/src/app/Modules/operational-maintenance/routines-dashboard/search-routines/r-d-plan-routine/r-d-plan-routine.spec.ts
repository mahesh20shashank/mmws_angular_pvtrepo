import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RDPlanRoutine } from './r-d-plan-routine';

describe('RDPlanRoutine', () => {
  let component: RDPlanRoutine;
  let fixture: ComponentFixture<RDPlanRoutine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RDPlanRoutine]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RDPlanRoutine);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
