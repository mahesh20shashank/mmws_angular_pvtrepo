import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SlipHistory } from './slip-history';

describe('SlipHistory', () => {
  let component: SlipHistory;
  let fixture: ComponentFixture<SlipHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SlipHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SlipHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
