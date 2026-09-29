import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActionRenderer } from './action-renderer';

describe('ActionRenderer', () => {
  let component: ActionRenderer;
  let fixture: ComponentFixture<ActionRenderer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ActionRenderer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ActionRenderer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
