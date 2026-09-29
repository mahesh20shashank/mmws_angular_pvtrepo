import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CreateDLIII } from './create-dliii';

describe('CreateDLIII', () => {
  let component: CreateDLIII;
  let fixture: ComponentFixture<CreateDLIII>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateDLIII]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CreateDLIII);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
