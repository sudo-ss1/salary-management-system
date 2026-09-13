import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';
import { ApiError } from './problem-detail';

describe('NotificationService', () => {
  let service: NotificationService;
  let snackBar: { open: jest.Mock };

  function apiError(overrides: Partial<ApiError>): ApiError {
    return {
      status: 500,
      title: 'Something went wrong',
      detail: 'The request could not be completed.',
      fieldErrors: {},
      isConflict: false,
      isVersionConflict: false,
      ...overrides,
    };
  }

  beforeEach(() => {
    snackBar = { open: jest.fn() };

    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: snackBar }],
    });

    service = TestBed.inject(NotificationService);
  });

  it('toasts a plain error', () => {
    service.notifyError(apiError({ detail: 'Something went wrong on the server' }));

    expect(snackBar.open).toHaveBeenCalledWith(
      'Something went wrong on the server',
      'Dismiss',
      { duration: 6000 },
    );
  });

  it('does not toast a field error the caller declares a control renders', () => {
    service.notifyError(
      apiError({ fieldErrors: { email: 'must be a well-formed email address' } }),
      new Set(['email']),
    );

    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('toasts a field error nothing has claimed, so it is never lost silently', () => {
    service.notifyError(
      apiError({ fieldErrors: { fullName: 'must not be blank' } }),
      new Set(['email']), // the caller renders email, but not fullName
    );

    expect(snackBar.open).toHaveBeenCalledWith('must not be blank', 'Dismiss', { duration: 6000 });
  });

  it('toasts a field error when the caller declares no rendered fields at all', () => {
    service.notifyError(apiError({ fieldErrors: { email: 'must be a well-formed email address' } }));

    expect(snackBar.open).toHaveBeenCalledWith(
      'must be a well-formed email address',
      'Dismiss',
      { duration: 6000 },
    );
  });

  it('toasts only the unclaimed messages when some fields are rendered and others are not', () => {
    service.notifyError(
      apiError({
        fieldErrors: { email: 'must be a well-formed email address', fullName: 'must not be blank' },
      }),
      new Set(['email']),
    );

    expect(snackBar.open).toHaveBeenCalledWith('must not be blank', 'Dismiss', { duration: 6000 });
  });

  it('does not toast a stale-version conflict, since a reload prompt covers it', () => {
    service.notifyError(apiError({ isConflict: true, isVersionConflict: true }));

    expect(snackBar.open).not.toHaveBeenCalled();
  });

  it('toasts a uniqueness conflict, since no reload prompt exists for it', () => {
    service.notifyError(
      apiError({
        isConflict: true,
        isVersionConflict: false,
        detail: 'That email address is already in use',
      }),
    );

    expect(snackBar.open).toHaveBeenCalledWith(
      'That email address is already in use',
      'Dismiss',
      { duration: 6000 },
    );
  });
});
