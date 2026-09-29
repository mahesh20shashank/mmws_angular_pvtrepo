import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';

import { OperationalCoordinationPlannerComponent } from './planner.component';
import { PlannerStore } from '../../store/planner.store';

describe('OperationalCoordinationPlannerComponent', () => {
  let component: OperationalCoordinationPlannerComponent;
  let fixture: ComponentFixture<OperationalCoordinationPlannerComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [OperationalCoordinationPlannerComponent, HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(OperationalCoordinationPlannerComponent);
    component = fixture.componentInstance;
    spyOn(TestBed.inject(PlannerStore), 'init').and.returnValue(Promise.resolve());
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
