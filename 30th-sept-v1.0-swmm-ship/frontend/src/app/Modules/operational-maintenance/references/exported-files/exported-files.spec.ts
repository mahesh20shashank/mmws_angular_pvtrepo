import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExportedFiles } from './exported-files.component';

describe('ExportedFiles', () => {
  let component: ExportedFiles;
  let fixture: ComponentFixture<ExportedFiles>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExportedFiles]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ExportedFiles);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
