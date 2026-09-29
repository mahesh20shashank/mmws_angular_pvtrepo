import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImportData } from './import-data';

describe('ImportData', () => {
  let component: ImportData;
  let fixture: ComponentFixture<ImportData>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportData]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImportData);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
