import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VktCrane } from './vkt-crane';

describe('VktCrane', () => {
  let component: VktCrane;
  let fixture: ComponentFixture<VktCrane>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VktCrane]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VktCrane);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
