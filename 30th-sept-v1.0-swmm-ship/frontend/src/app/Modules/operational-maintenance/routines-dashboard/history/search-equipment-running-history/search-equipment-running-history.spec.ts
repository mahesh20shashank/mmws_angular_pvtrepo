import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchEquipmentRunningHistory } from './search-equipment-running-history';

describe('SearchEquipmentRunningHistory', () => {
  let component: SearchEquipmentRunningHistory;
  let fixture: ComponentFixture<SearchEquipmentRunningHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchEquipmentRunningHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchEquipmentRunningHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
