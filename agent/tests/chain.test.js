import test from "node:test";
import assert from "node:assert/strict";
import { extractFeatured, looksLikeHomepage } from "../pipeline.js";
import { paceMs } from "../pace.js";
import { runChatChain } from "../chain.js";

test("abc homepage is treated as an index and an article url is not", () => {
  assert.equal(looksLikeHomepage("https://www.abc.net.au/"), true);
  assert.equal(looksLikeHomepage("https://www.abc.net.au/news/2024/01/01/story"), false);
});

test("featured text keeps the top headings and links", () => {
  const snapshot = [
    "- link \"SKIP TO MAIN CONTENT\" [ref=e1]",
    "- link \"NEWS\" [ref=e2]",
    "- heading \"National\" [ref=e3]",
    "- link \"Council faces questions over the flood levy\" [ref=e4]",
    "- paragraph",
  ].join("\n");
  const featured = extractFeatured(snapshot);
  assert.match(featured, /flood levy/);
  assert.match(featured, /National/);
  assert.doesNotMatch(featured, /SKIP/);
  assert.doesNotMatch(featured, /"NEWS"/);
});

test("pace is a few jittered seconds", () => {
  const low = paceMs(() => 0);
  const high = paceMs(() => 0.999);
  assert.ok(low >= 3000);
  assert.ok(high < 7000);
  assert.notEqual(low, high);
});

test("the chat chain saves the experience and queues publish", async () => {
  const paces = [];
  const saved = [];
  const pending = [];
  const result = await runChatChain({
    prompt: "look at https://www.abc.net.au/",
    url: "https://www.abc.net.au/",
  }, {
    pace: async () => { paces.push(1); },
    run: async () => ({
      ok: true,
      stdout: "- heading \"ABC\" [ref=e1]\n- link \"Top story\" [ref=e2]\n- link \"Next\" [ref=e3]",
    }),
    recordPending: async (row) => {
      pending.push(row);
      return { id: 9 };
    },
    save: async (row) => {
      saved.push(row);
      return { id: 4 };
    },
  });
  assert.equal(paces.length, 2);
  assert.equal(result.homepage, true);
  assert.equal(result.pending_id, 9);
  assert.match(result.proposed_url, /index\.php$/);
  assert.match(saved[0].asked, /abc\.net\.au/);
  assert.match(saved[0].found, /Top story/);
  assert.match(saved[0].published, /pending:9/);
  assert.equal(pending[0].tool, "publish_to_site");
  assert.equal(pending[0].args.slug, "home");
});
