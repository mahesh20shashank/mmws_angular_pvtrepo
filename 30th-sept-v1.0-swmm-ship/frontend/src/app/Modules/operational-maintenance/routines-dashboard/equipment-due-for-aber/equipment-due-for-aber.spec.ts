import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EquipmentDueForABER } from './equipment-due-for-aber';

describe('EquipmentDueForABER', () => {
  let component: EquipmentDueForABER;
  let fixture: ComponentFixture<EquipmentDueForABER>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EquipmentDueForABER]
    })
    .compileComponents();

    fixture = TestBed.createComponent(EquipmentDueForABER);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
