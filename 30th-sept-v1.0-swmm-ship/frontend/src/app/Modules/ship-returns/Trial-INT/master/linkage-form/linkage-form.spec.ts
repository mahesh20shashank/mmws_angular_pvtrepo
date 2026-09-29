import { ComponentFixture, TestBed } from '@angular/core/testing';

import { LinkageForm } from './linkage-form';

describe('LinkageForm', () => {
  let component: LinkageForm;
  let fixture: ComponentFixture<LinkageForm>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [LinkageForm]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LinkageForm);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
