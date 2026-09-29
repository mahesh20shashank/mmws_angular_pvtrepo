import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefactForm } from './defact-form';

describe('DefactForm', () => {
  let component: DefactForm;
  let fixture: ComponentFixture<DefactForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefactForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefactForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
