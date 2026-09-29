import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VkdFireScreenDriver } from './vkd-fire-screen-driver';

describe('VkdFireScreenDriver', () => {
  let component: VkdFireScreenDriver;
  let fixture: ComponentFixture<VkdFireScreenDriver>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VkdFireScreenDriver]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VkdFireScreenDriver);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
