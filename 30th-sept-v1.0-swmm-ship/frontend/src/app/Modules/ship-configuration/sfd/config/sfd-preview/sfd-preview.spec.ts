import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SfdPreview } from './sfd-preview';

describe('SfdPreview', () => {
  let component: SfdPreview;
  let fixture: ComponentFixture<SfdPreview>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SfdPreview]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SfdPreview);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
