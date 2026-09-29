/** Shared geometry for the planner grid (left table + timeline). */
export const ROW_HEIGHT_PX = 32;
export const HEADER_HEIGHT_PX = 48;

export const COLUMNS = [
  { key: "task", label: "Task", widthPx: 280 },
  { key: "owner", label: "Owner", widthPx: 88 },
  { key: "duration", label: "Dur.", widthPx: 52 },
  { key: "status", label: "Status", widthPx: 96 },
  { key: "deps", label: "Deps", widthPx: 64 },
] as const;

export const TABLE_WIDTH_PX = COLUMNS.reduce((sum, column) => sum + column.widthPx, 0);
