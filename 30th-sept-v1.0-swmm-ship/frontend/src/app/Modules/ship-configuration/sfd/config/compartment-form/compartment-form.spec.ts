import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CompartmentFrom } from './compartment-form';

describe('CompartmentFrom', () => {
  let component: CompartmentFrom;
  let fixture: ComponentFixture<CompartmentFrom>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CompartmentFrom]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CompartmentFrom);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
