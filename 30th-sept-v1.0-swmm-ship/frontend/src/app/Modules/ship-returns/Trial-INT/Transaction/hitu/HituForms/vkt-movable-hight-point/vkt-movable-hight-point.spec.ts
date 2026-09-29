import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VktMovableHightPoint } from './vkt-movable-hight-point';

describe('VktMovableHightPoint', () => {
  let component: VktMovableHightPoint;
  let fixture: ComponentFixture<VktMovableHightPoint>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VktMovableHightPoint]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VktMovableHightPoint);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
