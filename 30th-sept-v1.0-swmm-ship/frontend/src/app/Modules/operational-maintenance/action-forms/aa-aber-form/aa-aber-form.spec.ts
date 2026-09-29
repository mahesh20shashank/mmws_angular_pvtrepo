import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AaAberForm } from './aa-aber-form';

describe('AaAberForm', () => {
  let component: AaAberForm;
  let fixture: ComponentFixture<AaAberForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AaAberForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AaAberForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
