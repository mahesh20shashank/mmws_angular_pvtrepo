import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PlannedRoutines } from './planned-routines';

describe('PlannedRoutines', () => {
  let component: PlannedRoutines;
  let fixture: ComponentFixture<PlannedRoutines>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PlannedRoutines]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PlannedRoutines);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
