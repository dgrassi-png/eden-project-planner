import type { ActorType } from "@/domain/planning/constants";

/** Who performs a change; recorded on every audit event (metadata, not authentication). */
export interface Actor {
  type: ActorType;
  /** E:DEN user id (`eden_…`), agent id or `local-dev`; null when unknown. */
  id: string | null;
}
