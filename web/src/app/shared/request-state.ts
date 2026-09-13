import { ApiError } from '../core/problem-detail';

/**
 * Loading, error and ready are distinct states because they need distinct
 * messages. "No employees match these filters" and "we couldn't reach the
 * server" are different things; a spinner that never resolves is worse than both.
 * Empty is derived from ready, not modelled separately.
 */
export type RequestState<T> =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'ready'; data: T };

export const loading = <T>(): RequestState<T> => ({ status: 'loading' });
export const ready = <T>(data: T): RequestState<T> => ({ status: 'ready', data });
export const failed = <T>(error: ApiError): RequestState<T> => ({ status: 'error', error });
