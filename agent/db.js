import pg from "pg";
import { DATABASE_URL } from "./config.js";

let pool;

export function getPool() {
  if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
  if (!pool) pool = new pg.Pool({ connectionString: DATABASE_URL });
  return pool;
}
