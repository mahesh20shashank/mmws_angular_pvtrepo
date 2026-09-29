import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OperationalMaintenance } from './operational-maintenance';

describe('OperationalMaintenance', () => {
  let component: OperationalMaintenance;
  let fixture: ComponentFixture<OperationalMaintenance>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OperationalMaintenance]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OperationalMaintenance);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
