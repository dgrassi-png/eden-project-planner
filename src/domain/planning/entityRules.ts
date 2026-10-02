import { fail, issue, ok, type Issue, type Result } from "../result";

import { isValidWorkstreamCode, normalizeCode } from "./edenCode";
import type { Workstream } from "./types";

/** Validation for projects, workstreams and members. */

export const NAME_MAX = 120;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function checkName(value: string, field: string, issues: Issue[]): string {
  const name = value.trim();
  if (!name) issues.push(issue("NAME_REQUIRED", "Name is required", field));
  else if (name.length > NAME_MAX) issues.push(issue("NAME_TOO_LONG", `Name must be at most ${NAME_MAX} characters`, field));
  return name;
}

export interface ProjectDraft {
  name: string;
  slug: string;
  description: string | null;
}

export function prepareProject(input: { name: string; slug: string; description?: string | null }): Result<ProjectDraft> {
  const issues: Issue[] = [];
  const name = checkName(input.name, "name", issues);
  const slug = input.slug.trim();
  if (!SLUG_PATTERN.test(slug))
    issues.push(issue("SLUG_FORMAT", "Slug must be lowercase letters, digits and hyphens", "slug"));
  return issues.length ? fail(issues) : ok({ name, slug, description: input.description?.trim() || null });
}

export interface WorkstreamDraft {
  code: string;
  name: string;
  sortOrder: number;
}

export function prepareWorkstream(
  input: { code: string; name: string; sortOrder?: number },
  existing: Pick<Workstream, "code">[],
): Result<WorkstreamDraft> {
  const issues: Issue[] = [];
  const code = normalizeCode(input.code);
  if (!isValidWorkstreamCode(code))
    issues.push(issue("WORKSTREAM_CODE_FORMAT", "Workstream code must be 2–10 uppercase letters/digits, e.g. TEC", "code"));
  else if (existing.some((w) => w.code === code))
    issues.push(issue("WORKSTREAM_CODE_TAKEN", `Workstream ${code} already exists`, "code"));
  const name = checkName(input.name, "name", issues);
  const sortOrder = input.sortOrder ?? 0;
  if (!Number.isInteger(sortOrder)) issues.push(issue("SORT_ORDER_INVALID", "Sort order must be an integer", "sortOrder"));
  return issues.length ? fail(issues) : ok({ code, name, sortOrder });
}

/** Workstream codes are permanent: only name and order can change. */
export function prepareWorkstreamUpdate(
  current: Workstream,
  patch: { name?: string; sortOrder?: number },
): Result<Partial<Pick<Workstream, "name" | "sortOrder">>> {
  const issues: Issue[] = [];
  const changes: Partial<Pick<Workstream, "name" | "sortOrder">> = {};
  if (patch.name !== undefined) {
    const name = checkName(patch.name, "name", issues);
    if (name !== current.name) changes.name = name;
  }
  if (patch.sortOrder !== undefined) {
    if (!Number.isInteger(patch.sortOrder)) issues.push(issue("SORT_ORDER_INVALID", "Sort order must be an integer", "sortOrder"));
    else if (patch.sortOrder !== current.sortOrder) changes.sortOrder = patch.sortOrder;
  }
  return issues.length ? fail(issues) : ok(changes);
}

export interface MemberDraft {
  displayName: string;
  email: string | null;
}

export function prepareMember(input: { displayName: string; email?: string | null }): Result<MemberDraft> {
  const issues: Issue[] = [];
  const displayName = checkName(input.displayName, "displayName", issues);
  const email = input.email?.trim().toLowerCase() || null;
  if (email !== null && !EMAIL_PATTERN.test(email)) issues.push(issue("EMAIL_FORMAT", "Email is not valid", "email"));
  return issues.length ? fail(issues) : ok({ displayName, email });
}
