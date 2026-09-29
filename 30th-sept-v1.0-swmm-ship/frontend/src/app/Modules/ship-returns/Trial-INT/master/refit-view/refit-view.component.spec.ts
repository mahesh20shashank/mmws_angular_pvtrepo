import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RefitViewComponent } from './refit-view.component';

describe('RefitViewComponent', () => {
  let component: RefitViewComponent;
  let fixture: ComponentFixture<RefitViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefitViewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RefitViewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
