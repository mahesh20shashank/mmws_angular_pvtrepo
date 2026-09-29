import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DailyOrdersHistoryModal } from './daily-orders-history-modal';

describe('DailyOrdersHistoryModal', () => {
  let component: DailyOrdersHistoryModal;
  let fixture: ComponentFixture<DailyOrdersHistoryModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DailyOrdersHistoryModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DailyOrdersHistoryModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
