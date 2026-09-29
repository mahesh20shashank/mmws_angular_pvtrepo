import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RaiseFUSS } from './raise-fuss';

describe('RaiseFUSS', () => {
  let component: RaiseFUSS;
  let fixture: ComponentFixture<RaiseFUSS>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RaiseFUSS]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RaiseFUSS);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
