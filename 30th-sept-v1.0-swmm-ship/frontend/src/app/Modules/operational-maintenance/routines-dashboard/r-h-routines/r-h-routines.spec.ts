import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RHRoutines } from './r-h-routines';

describe('RHRoutines', () => {
  let component: RHRoutines;
  let fixture: ComponentFixture<RHRoutines>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RHRoutines]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RHRoutines);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
