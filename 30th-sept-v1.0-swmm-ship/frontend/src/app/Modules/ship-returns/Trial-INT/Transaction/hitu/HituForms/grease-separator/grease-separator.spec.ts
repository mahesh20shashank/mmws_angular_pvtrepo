import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GreaseSeparator } from './grease-separator';

describe('GreaseSeparator', () => {
  let component: GreaseSeparator;
  let fixture: ComponentFixture<GreaseSeparator>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GreaseSeparator]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GreaseSeparator);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
