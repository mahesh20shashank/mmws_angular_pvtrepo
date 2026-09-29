import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SearchRoutines } from './search-routines';

describe('SearchRoutines', () => {
  let component: SearchRoutines;
  let fixture: ComponentFixture<SearchRoutines>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SearchRoutines]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SearchRoutines);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
