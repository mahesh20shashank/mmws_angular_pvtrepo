import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VkdManualLiftingTransportingDevice } from './vkd-manual-lifting-transporting-device';

describe('VkdManualLiftingTransportingDevice', () => {
  let component: VkdManualLiftingTransportingDevice;
  let fixture: ComponentFixture<VkdManualLiftingTransportingDevice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VkdManualLiftingTransportingDevice]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VkdManualLiftingTransportingDevice);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
