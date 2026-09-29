import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CalendarBasedRoutines } from './calendar-based-routines';

describe('CalendarBasedRoutines', () => {
  let component: CalendarBasedRoutines;
  let fixture: ComponentFixture<CalendarBasedRoutines>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CalendarBasedRoutines]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CalendarBasedRoutines);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
