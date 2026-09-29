import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChecksOfIccpSystem } from './checks-of-iccp-system';

describe('ChecksOfIccpSystem', () => {
  let component: ChecksOfIccpSystem;
  let fixture: ComponentFixture<ChecksOfIccpSystem>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ChecksOfIccpSystem]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChecksOfIccpSystem);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
