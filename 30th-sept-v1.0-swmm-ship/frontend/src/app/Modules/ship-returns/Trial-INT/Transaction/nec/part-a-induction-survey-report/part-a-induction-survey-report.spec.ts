import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PartAInductionSurveyReport } from './part-a-induction-survey-report';

describe('PartAInductionSurveyReport', () => {
  let component: PartAInductionSurveyReport;
  let fixture: ComponentFixture<PartAInductionSurveyReport>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [PartAInductionSurveyReport]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PartAInductionSurveyReport);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
