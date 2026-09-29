import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FormCardDialogComponent } from './form-card-dialog.component';

describe('FormCardDialogComponent', () => {
  let component: FormCardDialogComponent;
  let fixture: ComponentFixture<FormCardDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [FormCardDialogComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FormCardDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
