import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RoutineDue } from './routine-due';

describe('RoutineDue', () => {
  let component: RoutineDue;
  let fixture: ComponentFixture<RoutineDue>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoutineDue]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RoutineDue);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
