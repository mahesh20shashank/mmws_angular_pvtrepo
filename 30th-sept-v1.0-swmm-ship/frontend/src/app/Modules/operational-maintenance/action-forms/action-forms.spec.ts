import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActionForms } from './action-forms';

describe('ActionForms', () => {
  let component: ActionForms;
  let fixture: ComponentFixture<ActionForms>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActionForms]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActionForms);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
