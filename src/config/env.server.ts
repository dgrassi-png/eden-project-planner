import "server-only";

import { parseServerEnv, type ServerEnv } from "./env.schema";

/**
 * Server-only configuration, including secrets (Identity session key,
 * Trello, AI providers). Importing this module from a Client Component fails
 * the build via the `server-only` package.
 *
 * Read lazily at request time so a single build can be promoted across
 * environments with different values.
 */
export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}
