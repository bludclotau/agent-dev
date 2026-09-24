import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "./db.js";
import { publishToSite } from "./pipeline.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, "../sql/pending_approvals.sql"), "utf8");

export async function ensureApprovals(pool = getPool()) {
  await pool.query(SCHEMA);
}

export async function recordPending({ persona = "wendy", tool, args, trace }, pool = getPool()) {
  await ensureApprovals(pool);
  const saved = await pool.query(
    `INSERT INTO pending_approvals (persona, tool, args, trace)
     VALUES ($1, $2, $3::jsonb, $4::jsonb)
     RETURNING id, status`,
    [persona, tool, JSON.stringify(args || {}), JSON.stringify(trace || [])],
  );
  return { id: Number(saved.rows[0].id), status: saved.rows[0].status };
}

export async function listPending(pool = getPool()) {
  await ensureApprovals(pool);
  const rows = await pool.query(
    `SELECT id, persona, tool, args, trace, status, created_at
     FROM pending_approvals
     WHERE status = 'pending'
     ORDER BY created_at DESC
     LIMIT 50`,
  );
  return rows.rows.map((row) => ({ ...row, id: Number(row.id) }));
}

export async function decide(id, status, { pool = getPool(), execute = publishToSite } = {}) {
  if (status !== "approved" && status !== "rejected") {
    throw new Error("status must be approved or rejected");
  }
  await ensureApprovals(pool);
  const found = await pool.query(
    "SELECT id, tool, args, status FROM pending_approvals WHERE id = $1",
    [id],
  );
  const row = found.rows[0];
  if (!row) return { ok: false, error: "not found" };
  if (row.status !== "pending") return { ok: false, error: `already ${row.status}` };
  let result = { ok: true };
  if (status === "approved") {
    if (row.tool !== "publish_to_site") return { ok: false, error: `no executor for ${row.tool}` };
    result = await execute(row.args || {});
    if (!result.ok) return result;
  }
  await pool.query(
    "UPDATE pending_approvals SET status = $2, decided_at = NOW() WHERE id = $1",
    [id, status],
  );
  return { ok: true, id: Number(row.id), status, result };
}
