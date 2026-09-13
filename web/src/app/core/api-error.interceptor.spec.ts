import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { apiErrorInterceptor } from './api-error.interceptor';
import { ApiError } from './problem-detail';

describe('apiErrorInterceptor', () => {
  let http: HttpClient;
  let mock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([apiErrorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => mock.verify());

  it('turns a validation failure into field errors the form can bind to', done => {
    http.get('/api/employees').subscribe({
      error: (error: ApiError) => {
        expect(error.status).toBe(400);
        expect(error.fieldErrors).toEqual({ email: 'must be a well-formed email address' });
        done();
      },
    });

    mock.expectOne('/api/employees').flush(
      {
        title: 'Validation failed',
        detail: 'One or more fields are invalid',
        errors: [{ field: 'email', message: 'must be a well-formed email address' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
  });

  it('marks a stale-version response as a conflict and carries the current version', done => {
    http.put('/api/employees/1', {}).subscribe({
      error: (error: ApiError) => {
        expect(error.isConflict).toBe(true);
        expect(error.currentVersion).toBe(3);
        done();
      },
    });

    mock.expectOne('/api/employees/1').flush(
      { title: 'Conflict', detail: 'This record changed since you loaded it.', currentVersion: 3 },
      { status: 409, statusText: 'Conflict' },
    );
  });

  it('describes a network failure in words the user can act on', done => {
    http.get('/api/employees').subscribe({
      error: (error: ApiError) => {
        expect(error.status).toBe(0);
        expect(error.detail).toContain('reach the server');
        done();
      },
    });

    mock.expectOne('/api/employees').error(new ProgressEvent('network error'));
  });

  it('leaves a successful response untouched', done => {
    http.get('/api/employees').subscribe(body => {
      expect(body).toEqual({ content: [] });
      done();
    });
    mock.expectOne('/api/employees').flush({ content: [] });
  });
});
