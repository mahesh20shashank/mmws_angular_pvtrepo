import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddDailyOrderModal } from './add-daily-order-modal';

describe('AddDailyOrderModal', () => {
  let component: AddDailyOrderModal;
  let fixture: ComponentFixture<AddDailyOrderModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddDailyOrderModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AddDailyOrderModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
