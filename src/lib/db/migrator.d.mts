import type BetterSqlite3 from "better-sqlite3";

export interface Migration {
  version: number;
  name: string;
  sql: string;
  checksum: string;
}

export function openDatabase(path: string, options?: { create?: boolean }): BetterSqlite3.Database;
export function listMigrations(directory: string): Migration[];
export function schemaVersion(db: BetterSqlite3.Database): number;
export function applyMigrations(db: BetterSqlite3.Database, directory: string): number[];
