import test from "node:test";
import assert from "node:assert/strict";
import { PLAN_TOOLS, TOOL_GRAMMAR, grammarFor, parseCall } from "../grammar.js";
import { SEED, selectFragments, toolsFor } from "../fragments.js";
import { resolvePublish, shellQuote, checkUrl } from "../pipeline.js";
import { plan } from "../planner.js";
import { supervise } from "../supervisor.js";
import { executeTool } from "../tools.js";

test("the grammar names only Wendy's pipeline", () => {
  for (const name of PLAN_TOOLS) assert.match(TOOL_GRAMMAR, new RegExp(`\\\\"${name}\\\\"`));
  assert.doesNotMatch(TOOL_GRAMMAR, /microvm_/);
  assert.doesNotMatch(TOOL_GRAMMAR, /browser_login/);
});

test("a call outside the set is refused", () => {
  assert.throws(() => parseCall('{"tool":"microvm_session_exec","args":{"command":"id"}}'));
  assert.equal(parseCall('{"tool":"done","args":{"text":"ok"}}').tool, "done");
});

test("publish slugs cannot choose a path", () => {
  const allow = { notes: "notes.php" };
  assert.equal(resolvePublish("notes", allow), "notes.php");
  assert.throws(() => resolvePublish("../etc/passwd", allow));
  assert.throws(() => resolvePublish("notes/../../x", allow));
  assert.throws(() => resolvePublish("other", allow));
});

test("page commands stay quoted inside the sandbox", () => {
  const quoted = shellQuote("https://example.com/a?q=1");
  assert.equal(quoted, "'https://example.com/a?q=1'");
  assert.throws(() => checkUrl("file:///etc/passwd"));
  assert.throws(() => checkUrl("https://user:secret@example.com"));
});

test("a read task drops publish from the grammar", () => {
  const tools = toolsFor(selectFragments("read https://example.com", SEED));
  assert.deepEqual(tools, ["find_page", "read_page", "done"]);
  assert.doesNotMatch(grammarFor(tools), /publish_to_site/);
  assert.doesNotMatch(grammarFor(tools), /save_to_db/);
});

test("a task that names every step keeps the five tools", () => {
  const tools = toolsFor(selectFragments("find the page, read it, save the content, and publish the slug", SEED));
  assert.deepEqual(tools, PLAN_TOOLS);
});

test("publish is queued for a person and is not executed", async () => {
  const calls = [];
  const pending = [];
  const result = await plan("publish the note", {
    maxSteps: 2,
    fragments: SEED,
    complete: async () => JSON.stringify({
      tool: "publish_to_site",
      args: { slug: "notes", title: "Hi", body: "There" },
    }),
    recordPending: async (row) => {
      pending.push(row);
      return { id: 7 };
    },
    execute: async (call) => {
      calls.push(call.tool);
      return { ok: true };
    },
  });
  assert.equal(result.pending, true);
  assert.equal(result.id, 7);
  assert.equal(pending[0].tool, "publish_to_site");
  assert.deepEqual(calls, []);
});

test("the supervisor starts a fresh attempt after a crash", async () => {
  let tries = 0;
  const result = await supervise(async () => {
    tries += 1;
    if (tries === 1) throw new Error("boom");
    return { ok: true, final: "recovered" };
  }, { restarts: 1 });
  assert.equal(result.final, "recovered");
  assert.equal(tries, 2);
});

test("the old microvm tool names are refused", async () => {
  const result = await executeTool({ command: "microvm_session_exec", commandText: "id" });
  assert.equal(result.ok, false);
});
