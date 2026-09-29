/** Static, non-secret application constants. */

export const APP_NAME = "E:DEN Project Planner";

/**
 * Planning calendar timezone. E:DEN operates from Cecina (Italy); "today" on
 * the timeline is evaluated in this zone so server and client agree.
 */
export const PLANNING_TIME_ZONE = "Europe/Rome";

/**
 * Existing Trello execution board (reference only). Actual board/list/label/
 * member IDs are discovered at runtime from configuration — never guessed.
 * A new board must never be created.
 */
export const TRELLO_BOARD_REFERENCE_URL = "https://trello.com/b/9n93W4ym/eden";
