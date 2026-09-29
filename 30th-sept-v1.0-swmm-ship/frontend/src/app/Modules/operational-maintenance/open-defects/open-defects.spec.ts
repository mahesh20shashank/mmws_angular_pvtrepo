import { ComponentFixture, TestBed } from '@angular/core/testing';

import { OpenDefects } from './open-defects';

describe('OpenDefects', () => {
  let component: OpenDefects;
  let fixture: ComponentFixture<OpenDefects>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OpenDefects]
    })
    .compileComponents();

    fixture = TestBed.createComponent(OpenDefects);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
