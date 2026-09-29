import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LocationMapping } from './location-mapping';

describe('LocationMapping', () => {
  let component: LocationMapping;
  let fixture: ComponentFixture<LocationMapping>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LocationMapping]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LocationMapping);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
