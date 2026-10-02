/** Validation outcome shared by domain rules. Framework-free. */

export interface Issue {
  /** Stable machine-readable code, e.g. `EDEN_CODE_FORMAT`. */
  code: string;
  message: string;
  /** Input field the issue refers to, when applicable. */
  field?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: Issue[] };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(issues: Issue[]): Result<T> {
  return { ok: false, issues };
}

export function issue(code: string, message: string, field?: string): Issue {
  return field === undefined ? { code, message } : { code, message, field };
}
