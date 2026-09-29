import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloseRoutine } from './close-routine';

describe('CloseRoutine', () => {
  let component: CloseRoutine;
  let fixture: ComponentFixture<CloseRoutine>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CloseRoutine]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CloseRoutine);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
