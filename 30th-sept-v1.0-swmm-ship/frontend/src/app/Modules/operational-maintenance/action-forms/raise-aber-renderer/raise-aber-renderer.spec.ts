import { ComponentFixture, TestBed } from '@angular/core/testing';

import { RaiseAberRenderer } from './raise-aber-renderer';

describe('RaiseAberRenderer', () => {
  let component: RaiseAberRenderer;
  let fixture: ComponentFixture<RaiseAberRenderer>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RaiseAberRenderer]
    })
    .compileComponents();

    fixture = TestBed.createComponent(RaiseAberRenderer);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
