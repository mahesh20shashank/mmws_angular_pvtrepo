import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GuaranteeDefectForm } from './guarantee-defect-form';

describe('GuaranteeDefectForm', () => {
  let component: GuaranteeDefectForm;
  let fixture: ComponentFixture<GuaranteeDefectForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GuaranteeDefectForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GuaranteeDefectForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
