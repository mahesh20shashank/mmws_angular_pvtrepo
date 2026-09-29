import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CollapsibleSidebar } from './collapsible-sidebar';

describe('CollapsibleSidebar', () => {
  let component: CollapsibleSidebar;
  let fixture: ComponentFixture<CollapsibleSidebar>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollapsibleSidebar]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CollapsibleSidebar);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
