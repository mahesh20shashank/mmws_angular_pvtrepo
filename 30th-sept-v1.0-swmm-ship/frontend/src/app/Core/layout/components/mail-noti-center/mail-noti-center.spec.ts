import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MailNotiCenter } from './mail-noti-center';

describe('MailNotiCenter', () => {
  let component: MailNotiCenter;
  let fixture: ComponentFixture<MailNotiCenter>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MailNotiCenter]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MailNotiCenter);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
