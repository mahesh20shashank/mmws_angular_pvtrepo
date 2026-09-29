import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CloseFUSS } from './close-fuss';

describe('CloseFUSS', () => {
  let component: CloseFUSS;
  let fixture: ComponentFixture<CloseFUSS>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CloseFUSS]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CloseFUSS);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
