import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefectActionForm } from './defect-action-form';

describe('DefectActionForm', () => {
  let component: DefectActionForm;
  let fixture: ComponentFixture<DefectActionForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefectActionForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefectActionForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
