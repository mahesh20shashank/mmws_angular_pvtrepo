import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VkdRasWinch } from './vkd-ras-winch';

describe('VkdRasWinch', () => {
  let component: VkdRasWinch;
  let fixture: ComponentFixture<VkdRasWinch>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VkdRasWinch]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VkdRasWinch);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
