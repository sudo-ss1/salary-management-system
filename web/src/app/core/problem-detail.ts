/** RFC 7807, as produced by Spring's ProblemDetail. */
export interface ProblemDetail {
  readonly title?: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<{ field: string; message: string }>;
  readonly currentVersion?: number;
}

export interface ApiError {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  /** Keyed by field name, ready to bind to form controls. */
  readonly fieldErrors: Readonly<Record<string, string>>;
  readonly currentVersion?: number;
  readonly isConflict: boolean;
}
