import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Breadcrum } from './breadcrum';

describe('Breadcrum', () => {
  let component: Breadcrum;
  let fixture: ComponentFixture<Breadcrum>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Breadcrum]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Breadcrum);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
