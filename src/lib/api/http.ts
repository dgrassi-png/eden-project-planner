import "server-only";

import { z } from "zod";

import { EnvValidationError } from "@/config/env.schema";
import type { Issue } from "@/domain/result";
import { HTTP_STATUS, PlanningError } from "@/lib/planning/errors";
import { getCurrentPrincipal } from "@/lib/auth/server";
import { actorFor } from "@/lib/auth/session";
import { getPlanningBackend } from "@/lib/planning/server";
import type { PlanningService } from "@/lib/planning/service";

const MAX_BODY_BYTES = 64 * 1024;

export interface ApiErrorBody {
  error: { kind: string; message: string; issues: Issue[] };
}

function errorResponse(status: number, kind: string, message: string, issues: Issue[] = []): Response {
  const body: ApiErrorBody = { error: { kind, message, issues } };
  return Response.json(body, { status });
}

function toIssues(error: z.ZodError): Issue[] {
  return error.issues.map((i) => {
    const field = i.path.map(String).join(".");
    return field ? { code: "INVALID_INPUT", message: `${field}: ${i.message}`, field } : { code: "INVALID_INPUT", message: i.message };
  });
}

/** Parses and validates a JSON body. Throws PlanningError on failure. */
export async function readBody<S extends z.ZodType>(request: Request, schema: S): Promise<z.infer<S>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw PlanningError.validation([{ code: "BODY_TOO_LARGE", message: "Request body is too large" }]);
  }
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw PlanningError.validation([{ code: "INVALID_JSON", message: "Request body must be valid JSON" }]);
  }
  const result = schema.safeParse(json);
  if (!result.success) throw PlanningError.validation(toIssues(result.error));
  return result.data;
}

/** Validates a route id; malformed ids are reported as not found. */
export function parseId(value: string, what: string): string {
  if (!z.uuid().safeParse(value).success) throw PlanningError.notFound(what);
  return value;
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rejects cross-site writes: browsers always send Origin on these requests. */
function isCrossOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || !MUTATING.has(request.method)) return false;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

interface HandlerContext<P> {
  request: Request;
  params: P;
  service: PlanningService;
}

/**
 * Wraps a planning route: configuration check, origin check, error mapping.
 * Handlers return data (sent as `{ data }`) or `undefined` (204).
 */
export function planningRoute<P>(handler: (ctx: HandlerContext<P>) => Promise<unknown>, successStatus = 200) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    try {
      if (isCrossOrigin(request)) return errorResponse(403, "forbidden", "Cross-origin request rejected");
      const principal = await getCurrentPrincipal();
      if (!principal) return errorResponse(401, "unauthenticated", "Sign in with E:DEN Identity");
      const backend = getPlanningBackend(actorFor(principal));
      if (backend.status !== "ready") {
        return errorResponse(503, "unavailable", "Supabase is not configured on the server");
      }
      const data = await handler({ request, params: await context.params, service: backend.service });
      return data === undefined ? new Response(null, { status: 204 }) : Response.json({ data }, { status: successStatus });
    } catch (error) {
      if (error instanceof PlanningError) {
        return errorResponse(HTTP_STATUS[error.kind], error.kind, error.message, error.issues);
      }
      if (error instanceof EnvValidationError) {
        return errorResponse(503, "unavailable", "Server environment configuration is invalid");
      }
      console.error("Unhandled planning API error", error);
      return errorResponse(500, "internal", "Unexpected server error");
    }
  };
}

/** Rejects attempts to patch permanent fields with a clear message. */
export async function readTaskPatch<S extends z.ZodType>(
  request: Request,
  schema: S,
  immutable: readonly string[],
): Promise<z.infer<S>> {
  const clone = request.clone();
  let raw: unknown = null;
  try {
    raw = JSON.parse(await clone.text());
  } catch {
    // readBody reports invalid JSON.
  }
  if (raw && typeof raw === "object") {
    const blocked = immutable.filter((key) => key in raw);
    if (blocked.length) {
      throw PlanningError.validation(
        blocked.map((field) => ({
          code: field === "plannedFinish" ? "FINISH_DERIVED" : "FIELD_IMMUTABLE",
          message:
            field === "plannedFinish"
              ? "Planned finish is derived from start and duration and cannot be set directly"
              : `${field} is permanent and cannot be changed`,
          field,
        })),
      );
    }
  }
  return readBody(request, schema);
}
