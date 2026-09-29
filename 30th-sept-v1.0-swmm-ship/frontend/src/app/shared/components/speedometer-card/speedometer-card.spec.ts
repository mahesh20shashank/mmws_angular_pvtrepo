import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SpeedometerCard } from './speedometer-card';

describe('SpeedometerCard', () => {
  let component: SpeedometerCard;
  let fixture: ComponentFixture<SpeedometerCard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpeedometerCard]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SpeedometerCard);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
