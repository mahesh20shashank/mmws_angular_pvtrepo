import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefectView } from './defect-view';

describe('DefectView', () => {
  let component: DefectView;
  let fixture: ComponentFixture<DefectView>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefectView]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefectView);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
