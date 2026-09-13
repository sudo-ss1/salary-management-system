import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { ApiError, ProblemDetail } from './problem-detail';

export const apiErrorInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((response: HttpErrorResponse) => throwError(() => toApiError(response))),
  );

function toApiError(response: HttpErrorResponse): ApiError {
  // status 0 means the request never reached the server - a different problem
  // from anything the server said, and a different message to the user.
  if (response.status === 0) {
    return {
      status: 0,
      title: 'Cannot reach the server',
      detail: 'We could not reach the server. Check your connection and try again.',
      fieldErrors: {},
      isConflict: false,
      isVersionConflict: false,
    };
  }

  const problem: ProblemDetail = response.error ?? {};
  const fieldErrors: Record<string, string> = {};
  for (const error of problem.errors ?? []) {
    fieldErrors[error.field] = error.message;
  }

  return {
    status: response.status,
    title: problem.title ?? 'Something went wrong',
    detail: problem.detail ?? 'The request could not be completed.',
    fieldErrors,
    currentVersion: problem.currentVersion,
    isConflict: response.status === 409,
    // An unlabelled 409 is treated as a version conflict by default: that is
    // the safe direction, since a reload prompt shown unnecessarily costs a
    // click, while a silently swallowed uniqueness error costs the user's work.
    isVersionConflict: response.status === 409 && problem.conflictKind !== 'UNIQUE_CONSTRAINT',
  };
}
