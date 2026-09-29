import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GarbageCompactor } from './garbage-compactor';

describe('GarbageCompactor', () => {
  let component: GarbageCompactor;
  let fixture: ComponentFixture<GarbageCompactor>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [GarbageCompactor]
    })
    .compileComponents();

    fixture = TestBed.createComponent(GarbageCompactor);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
