import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubdepartmentForm } from './subdepartment-form';

describe('SubdepartmentForm', () => {
  let component: SubdepartmentForm;
  let fixture: ComponentFixture<SubdepartmentForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubdepartmentForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubdepartmentForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
