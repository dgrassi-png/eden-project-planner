import type { Issue } from "@/domain/result";

/** Minimal JSON client for the planner API (same-origin, called from Client Components). */

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; issues: Issue[] };

interface ErrorBody {
  error?: { message?: string; issues?: Issue[] };
}

export async function apiRequest<T = unknown>(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: "Network error: the server could not be reached", issues: [] };
  }
  if (response.status === 204) return { ok: true, data: undefined as T };
  const json = (await response.json().catch(() => ({}))) as { data?: T } & ErrorBody;
  if (response.ok) return { ok: true, data: json.data as T };
  return {
    ok: false,
    message: json.error?.message ?? `Request failed (${response.status})`,
    issues: json.error?.issues ?? [],
  };
}
