import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloseRoutineHistory } from './close-routine-history';

describe('CloseRoutineHistory', () => {
  let component: CloseRoutineHistory;
  let fixture: ComponentFixture<CloseRoutineHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CloseRoutineHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CloseRoutineHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
