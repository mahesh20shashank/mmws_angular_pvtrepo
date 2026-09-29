import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VkdSacBladeReplacementDevice } from './vkd-sac-blade-replacement-device';

describe('VkdSacBladeReplacementDevice', () => {
  let component: VkdSacBladeReplacementDevice;
  let fixture: ComponentFixture<VkdSacBladeReplacementDevice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VkdSacBladeReplacementDevice]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VkdSacBladeReplacementDevice);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
