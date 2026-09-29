import { ComponentFixture, TestBed } from '@angular/core/testing';

import { HistoryViewActionComponent } from './view-action.component';

describe('ViewAction', () => {
  let component: HistoryViewActionComponent;
  let fixture: ComponentFixture<HistoryViewActionComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryViewActionComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HistoryViewActionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
