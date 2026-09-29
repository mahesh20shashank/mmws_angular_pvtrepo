import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PartBInductionSurveyReport } from './part-b-induction-survey-report';

describe('PartBInductionSurveyReport', () => {
  let component: PartBInductionSurveyReport;
  let fixture: ComponentFixture<PartBInductionSurveyReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PartBInductionSurveyReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PartBInductionSurveyReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
