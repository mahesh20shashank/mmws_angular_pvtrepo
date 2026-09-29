import { ComponentFixture, TestBed } from '@angular/core/testing';

import { References } from './references';

describe('References', () => {
  let component: References;
  let fixture: ComponentFixture<References>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [References]
    })
    .compileComponents();

    fixture = TestBed.createComponent(References);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
