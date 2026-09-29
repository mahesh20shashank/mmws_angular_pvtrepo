import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateRA } from './create-ra';

describe('CreateRA', () => {
  let component: CreateRA;
  let fixture: ComponentFixture<CreateRA>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateRA]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateRA);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
