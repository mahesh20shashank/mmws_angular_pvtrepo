import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormModal } from './form-modal';

describe('FormModal', () => {
  let component: FormModal;
  let fixture: ComponentFixture<FormModal>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormModal]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormModal);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
