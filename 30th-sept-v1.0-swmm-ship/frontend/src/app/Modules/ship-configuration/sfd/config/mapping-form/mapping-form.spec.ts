import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MappingForm } from './mapping-form';

describe('MappingForm', () => {
  let component: MappingForm;
  let fixture: ComponentFixture<MappingForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MappingForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MappingForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
