import "server-only";

import { isLoopbackHost } from "@/config/auth";
import { getServerEnv } from "@/config/env.server";
import type { Principal } from "@/lib/auth/session";
import { getDatabase } from "@/lib/db/connection";
import { PlanningError } from "@/lib/planning/errors";
import { createSqlitePlanningStore } from "@/lib/planning/sqliteStore";

import { createTrelloClient, TRELLO_API_BASE_URL, type TrelloApi } from "./client";
import { TrelloSyncService } from "./syncService";

function trelloApi(): { api: TrelloApi | null; boardRef: string | null } {
  const env = getServerEnv();
  if (!env.TRELLO_API_KEY || !env.TRELLO_API_TOKEN || !env.TRELLO_BOARD_ID) return { api: null, boardRef: null };
  const baseUrl = env.TRELLO_API_BASE_URL?.replace(/\/$/, "");
  // The credentials may only ever be sent to Trello itself or to a local test double.
  if (baseUrl && baseUrl !== TRELLO_API_BASE_URL && !isLoopbackHost(new URL(baseUrl).hostname)) {
    throw new PlanningError("unavailable", "TRELLO_API_BASE_URL must be the Trello API or a loopback test server");
  }
  return {
    api: createTrelloClient({ apiKey: env.TRELLO_API_KEY, token: env.TRELLO_API_TOKEN, baseUrl }),
    boardRef: env.TRELLO_BOARD_ID,
  };
}

/**
 * Trello service for a signed-in user. Mapping changes are audited as the
 * user; sync bookkeeping is audited as TRELLO_SYNC on behalf of the user.
 */
export function getTrelloService(principal: Principal, role: "settings" | "sync"): TrelloSyncService {
  const { api, boardRef } = trelloApi();
  const actor = { type: role === "sync" ? ("TRELLO_SYNC" as const) : ("USER" as const), id: principal.edenUserId };
  return new TrelloSyncService(createSqlitePlanningStore(getDatabase(), actor), api, boardRef);
}
