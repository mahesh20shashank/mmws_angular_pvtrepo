import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FUSSTrigerList } from './fuss-triger-list';

describe('FUSSTrigerList', () => {
  let component: FUSSTrigerList;
  let fixture: ComponentFixture<FUSSTrigerList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FUSSTrigerList]
    })
    .compileComponents();

    fixture = TestBed.createComponent(FUSSTrigerList);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
