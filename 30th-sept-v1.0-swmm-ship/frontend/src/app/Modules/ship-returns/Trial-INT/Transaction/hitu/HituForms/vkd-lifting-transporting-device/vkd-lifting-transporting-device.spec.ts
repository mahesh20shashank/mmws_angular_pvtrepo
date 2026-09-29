import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VkdLiftingTransportingDevice } from './vkd-lifting-transporting-device';

describe('VkdLiftingTransportingDevice', () => {
  let component: VkdLiftingTransportingDevice;
  let fixture: ComponentFixture<VkdLiftingTransportingDevice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VkdLiftingTransportingDevice]
    })
    .compileComponents();

    fixture = TestBed.createComponent(VkdLiftingTransportingDevice);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
