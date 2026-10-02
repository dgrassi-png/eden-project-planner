/**
 * E:DEN codes: permanent task identifiers.
 *
 *   TEC-001      task      (PREFIX-NNN, at least 3 digits)
 *   TEC-001.1    subtask   (one level only; prefix = parent code)
 *
 * Codes are assigned once and never change, even when titles do. The rules
 * here mirror the database constraints in db/migrations.
 */

export const EDEN_CODE_PATTERN = /^([A-Z][A-Z0-9]{1,9})-(\d{3,})(?:\.([1-9]\d*))?$/;
export const WORKSTREAM_CODE_PATTERN = /^[A-Z][A-Z0-9]{1,9}$/;

export interface ParsedEdenCode {
  code: string;
  prefix: string;
  number: number;
  subtaskNumber: number | null;
  /** Code of the parent task for subtasks, otherwise null. */
  parentCode: string | null;
}

/** Trims and upper-cases user input. Does not validate. */
export function normalizeCode(input: string): string {
  return input.trim().toUpperCase();
}

export function parseEdenCode(code: string): ParsedEdenCode | null {
  const match = EDEN_CODE_PATTERN.exec(code);
  if (!match) return null;
  const [, prefix = "", digits = "", sub] = match;
  return {
    code,
    prefix,
    number: Number(digits),
    subtaskNumber: sub === undefined ? null : Number(sub),
    parentCode: sub === undefined ? null : `${prefix}-${digits}`,
  };
}

export function isValidEdenCode(code: string): boolean {
  return EDEN_CODE_PATTERN.test(code);
}

export function isValidWorkstreamCode(code: string): boolean {
  return WORKSTREAM_CODE_PATTERN.test(code);
}

/** Natural order: TEC-002 < TEC-010, TEC-001 < TEC-001.1 < TEC-001.2 < TEC-001.10. */
export function compareEdenCodes(a: string, b: string): number {
  const pa = parseEdenCode(a);
  const pb = parseEdenCode(b);
  if (!pa || !pb) return a.localeCompare(b);
  return (
    pa.prefix.localeCompare(pb.prefix) ||
    pa.number - pb.number ||
    (pa.subtaskNumber ?? 0) - (pb.subtaskNumber ?? 0)
  );
}

/** Next free top-level code for a prefix, e.g. `TEC-004`. A suggestion only. */
export function suggestNextTaskCode(prefix: string, existingCodes: Iterable<string>): string {
  let max = 0;
  for (const code of existingCodes) {
    const parsed = parseEdenCode(code);
    if (parsed && parsed.prefix === prefix && parsed.subtaskNumber === null) max = Math.max(max, parsed.number);
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** Next free subtask code under a parent, e.g. `TEC-001.3`. A suggestion only. */
export function suggestNextSubtaskCode(parentCode: string, existingCodes: Iterable<string>): string {
  let max = 0;
  for (const code of existingCodes) {
    const parsed = parseEdenCode(code);
    if (parsed?.parentCode === parentCode && parsed.subtaskNumber !== null) max = Math.max(max, parsed.subtaskNumber);
  }
  return `${parentCode}.${max + 1}`;
}
