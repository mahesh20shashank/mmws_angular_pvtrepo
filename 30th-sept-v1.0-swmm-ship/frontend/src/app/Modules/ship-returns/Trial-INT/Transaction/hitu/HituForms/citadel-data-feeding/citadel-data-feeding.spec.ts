import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CitadelDataFeeding } from './citadel-data-feeding';

describe('CitadelDataFeeding', () => {
  let component: CitadelDataFeeding;
  let fixture: ComponentFixture<CitadelDataFeeding>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [CitadelDataFeeding]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CitadelDataFeeding);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
