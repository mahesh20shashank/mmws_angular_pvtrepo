import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DefectClosureDetails } from './defect-closure-details';

describe('DefectClosureDetails', () => {
  let component: DefectClosureDetails;
  let fixture: ComponentFixture<DefectClosureDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DefectClosureDetails]
    })
    .compileComponents();

    fixture = TestBed.createComponent(DefectClosureDetails);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
