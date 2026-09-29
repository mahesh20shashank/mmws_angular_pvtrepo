import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MovementHistory } from './movement-history';

describe('MovementHistory', () => {
  let component: MovementHistory;
  let fixture: ComponentFixture<MovementHistory>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MovementHistory]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MovementHistory);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
