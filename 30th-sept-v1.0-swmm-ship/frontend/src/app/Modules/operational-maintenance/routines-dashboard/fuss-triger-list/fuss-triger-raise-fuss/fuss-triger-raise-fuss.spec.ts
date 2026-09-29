import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FUSSTrigerRaiseFuss } from './fuss-triger-raise-fuss';

describe('FUSSTrigerRaiseFuss', () => {
  let component: FUSSTrigerRaiseFuss;
  let fixture: ComponentFixture<FUSSTrigerRaiseFuss>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FUSSTrigerRaiseFuss]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FUSSTrigerRaiseFuss);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
