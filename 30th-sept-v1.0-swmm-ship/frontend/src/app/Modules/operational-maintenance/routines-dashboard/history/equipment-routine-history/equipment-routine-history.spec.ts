import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipmentRoutineHistory } from './equipment-routine-history';

describe('EquipmentRoutineHistory', () => {
  let component: EquipmentRoutineHistory;
  let fixture: ComponentFixture<EquipmentRoutineHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentRoutineHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EquipmentRoutineHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
