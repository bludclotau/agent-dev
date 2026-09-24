import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PLAN_TOOLS } from "./grammar.js";
import { getPool } from "./db.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA = fs.readFileSync(path.join(here, "../sql/prompt_fragments.sql"), "utf8");

// Split from the sentences that used to be hardcoded in llm.js.
export const SEED = [
  {
    name: "core-persona",
    scope: "coarse",
    tags: ["wendy", "core"],
    tools: [],
    text: "You are Wendy. You find a page, read it, save the useful part, and publish only when asked.",
  },
  {
    name: "fine-find-read",
    scope: "fine",
    tags: ["find", "page", "search", "url", "read"],
    tools: ["find_page", "read_page"],
    text: "find_page takes query or url. read_page takes url.",
  },
  {
    name: "fine-save",
    scope: "fine",
    tags: ["save", "database", "db", "content", "title"],
    tools: ["save_to_db"],
    text: "save_to_db takes url, title, and content.",
  },
  {
    name: "fine-publish",
    scope: "fine",
    tags: ["publish", "site", "slug", "post"],
    tools: ["publish_to_site"],
    text: "publish_to_site takes slug, title, and body. slug is a name from the allowlist, not a filesystem path.",
  },
  {
    name: "core-done",
    scope: "coarse",
    tags: ["done", "finish", "stop", "core"],
    tools: ["done"],
    text: "When the goal is finished, call done with args text set to a short answer.",
  },
  {
    name: "core-json",
    scope: "coarse",
    tags: ["json", "core"],
    tools: [],
    text: "Reply with one JSON object.",
  },
];

export function tokens(text) {
  return new Set(String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
}

export function selectFragments(goal, library = SEED) {
  const words = tokens(goal);
  const core = library.filter((fragment) => fragment.scope === "coarse" || (fragment.tags || []).includes("core"));
  const fine = library.filter((fragment) => fragment.scope === "fine");
  const matched = fine.filter((fragment) => (fragment.tags || []).some((tag) => words.has(String(tag).toLowerCase())));
  return [...core, ...(matched.length ? matched : fine)];
}

export function toolsFor(fragments) {
  const tools = new Set(["done"]);
  for (const fragment of fragments) {
    for (const tool of fragment.tools || []) tools.add(tool);
  }
  return PLAN_TOOLS.filter((name) => tools.has(name));
}

export function assemblePrompt(fragments, goal, steps) {
  const allowed = toolsFor(fragments);
  return [
    ...fragments.map((fragment) => fragment.text),
    `Allowed tools: ${allowed.join(", ")}.`,
    `Goal: ${goal}`,
    `Previous steps: ${JSON.stringify(steps || []).slice(0, 6000)}`,
    "Assistant:",
  ].join("\n");
}

export async function ensureFragments(pool = getPool()) {
  await pool.query(SCHEMA);
  for (const fragment of SEED) {
    await pool.query(
      `INSERT INTO prompt_fragments (name, scope, tags, tools, text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (name) DO NOTHING`,
      [fragment.name, fragment.scope, fragment.tags, fragment.tools, fragment.text],
    );
  }
  const rows = await pool.query(
    "SELECT id, name, scope, tags, tools, text FROM prompt_fragments ORDER BY id",
  );
  return rows.rows;
}
