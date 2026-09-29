import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpareSelectionModal } from './spare-selection-modal';

describe('SpareSelectionModal', () => {
  let component: SpareSelectionModal;
  let fixture: ComponentFixture<SpareSelectionModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpareSelectionModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpareSelectionModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
