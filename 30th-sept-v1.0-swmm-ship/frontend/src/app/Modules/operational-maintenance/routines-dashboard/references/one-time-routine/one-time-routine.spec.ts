import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OneTimeRoutine } from './one-time-routine';

describe('OneTimeRoutine', () => {
  let component: OneTimeRoutine;
  let fixture: ComponentFixture<OneTimeRoutine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OneTimeRoutine]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OneTimeRoutine);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
