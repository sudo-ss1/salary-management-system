/** RFC 7807, as produced by Spring's ProblemDetail. */
export interface ProblemDetail {
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<{ field: string; message: string }>;
  readonly currentVersion?: number;
  readonly conflictKind?: 'STALE_VERSION' | 'UNIQUE_CONSTRAINT';
}

export interface ApiError {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  /** Keyed by field name, ready to bind to form controls. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly currentVersion?: number;
  /** Any 409, regardless of kind. */
  readonly isConflict: boolean;
  /**
   * A 409 that needs a reload prompt rather than its message shown. An
   * unlabelled 409 defaults to true: a reload prompt shown unnecessarily
   * costs a click, but a swallowed uniqueness error costs the user's work.
   */
  readonly isVersionConflict: boolean;
}
