import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GridActionButton } from './grid-action-button';

describe('GridActionButton', () => {
  let component: GridActionButton;
  let fixture: ComponentFixture<GridActionButton>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GridActionButton]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GridActionButton);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
