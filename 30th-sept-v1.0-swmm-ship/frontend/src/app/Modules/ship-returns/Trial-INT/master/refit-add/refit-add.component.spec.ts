import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RefitAddComponent } from './refit-add.component';

describe('RefitAddComponent', () => {
  let component: RefitAddComponent;
  let fixture: ComponentFixture<RefitAddComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RefitAddComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RefitAddComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
