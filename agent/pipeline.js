import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { DATABASE_URL, PERSONA, PUBLISH_URL } from "./config.js";
import { runInSandbox } from "./sandbox.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, "../sql/findings.sql"), "utf8");
const ALLOWLIST_PATH = path.join(here, "../site/allowlist.json");

export function checkUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url must be http or https");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("url must be http or https");
  }
  if (parsed.username || parsed.password) throw new Error("url must not contain credentials");
  return url;
}

export function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

export function loadAllowlist(file = ALLOWLIST_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function resolvePublish(slug, allowlist = loadAllowlist()) {
  if (typeof slug !== "string" || !/^[a-z0-9-]{1,40}$/.test(slug)) {
    throw new Error("slug is not allowlisted");
  }
  const filename = allowlist[slug];
  if (typeof filename !== "string" || filename !== path.basename(filename) || filename.includes("..")) {
    throw new Error("slug is not allowlisted");
  }
  return filename;
}

function browserCommand(url, mode) {
  const quoted = shellQuote(checkUrl(url));
  const bin = process.env.AGENT_BROWSER_BIN || "/usr/local/bin/agent-browser";
  if (mode === "find") {
    return `${bin} --session wendy-find open ${quoted} && ${bin} --session wendy-find snapshot`;
  }
  return `${bin} --session wendy-read open ${quoted} && ${bin} --session wendy-read read`;
}

export async function findPage(args, deps = {}) {
  const run = deps.run || runInSandbox;
  const url = args.url
    ? checkUrl(args.url)
    : `https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(args.query || "").trim())}`;
  if (!args.url && !String(args.query || "").trim()) throw new Error("query or url is required");
  checkUrl(url);
  const command = browserCommand(url, "find");
  const result = await run(command);
  return { ok: Boolean(result.ok), url, stdout: result.stdout || "", error: result.error || null };
}

export async function readPage(args, deps = {}) {
  const run = deps.run || runInSandbox;
  const url = checkUrl(args.url);
  const command = browserCommand(url, "read");
  const result = await run(command);
  return { ok: Boolean(result.ok), url, stdout: result.stdout || "", error: result.error || null };
}

export async function saveToDb(args, deps = {}) {
  const url = checkUrl(args.url);
  const title = String(args.title || "").slice(0, 200);
  const content = String(args.content || "").trim();
  if (!content) throw new Error("content is required");
  const connectionString = deps.databaseUrl || DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const pool = new pg.Pool({ connectionString });
  try {
    await pool.query(SCHEMA);
    const saved = await pool.query(
      `INSERT INTO findings (persona, source_url, title, content)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [PERSONA, url, title, content.slice(0, 20000)],
    );
    return { ok: true, id: Number(saved.rows[0].id) };
  } finally {
    await pool.end();
  }
}

export async function publishToSite(args, deps = {}) {
  const filename = resolvePublish(args.slug, deps.allowlist);
  const title = String(args.title || "").slice(0, 200);
  const body = String(args.body || "").slice(0, 20000);
  const token = deps.token || process.env.PUBLISH_TOKEN || "";
  if (!token) throw new Error("PUBLISH_TOKEN is not set");
  const fetchImpl = deps.fetchImpl || fetch;
  const response = await fetchImpl(deps.publishUrl || PUBLISH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug: args.slug, title, body, token }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    return { ok: false, error: payload.error || `publish ${response.status}`, filename };
  }
  return { ok: true, filename, path: payload.path };
}

export async function executeWendyTool(call, deps = {}) {
  const args = call.args || {};
  if (call.tool === "find_page") return findPage(args, deps);
  if (call.tool === "read_page") return readPage(args, deps);
  if (call.tool === "save_to_db") return saveToDb(args, deps);
  if (call.tool === "publish_to_site") return publishToSite(args, deps);
  if (call.tool === "done") return { ok: true, final: String(args.text || "") };
  return { ok: false, error: `unknown tool ${call.tool}` };
}
