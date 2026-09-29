import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConfirmationAlert } from './confirmation-alert';

describe('ConfirmationAlert', () => {
  let component: ConfirmationAlert;
  let fixture: ComponentFixture<ConfirmationAlert>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfirmationAlert]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConfirmationAlert);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
