import { TestBed } from '@angular/core/testing';
import { CommonApiService } from './commonApiService';

describe('commonApiService', () => {
  let service: CommonApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CommonApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
