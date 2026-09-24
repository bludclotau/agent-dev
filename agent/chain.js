import { recordPending } from "./approvals.js";
import { findPage, looksLikeHomepage, readPage, saveToDb } from "./pipeline.js";

function titleFrom(text, fallback) {
  const line = String(text || "").split("\n").find((row) => /heading /i.test(row));
  if (!line) return fallback;
  const quoted = line.match(/"([^"]+)"/);
  return (quoted ? quoted[1] : line).slice(0, 200);
}

export async function runChatChain({ prompt, url }, deps = {}) {
  const foundPage = await findPage({ url }, deps);
  const read = await readPage({ url }, deps);
  const featured = (read.stdout || foundPage.stdout || read.error || foundPage.error || "").trim();
  const homepage = Boolean(read.homepage) || looksLikeHomepage(url, featured);
  const title = titleFrom(featured, url);
  const slug = homepage ? "home" : "notes";
  const filename = slug === "home" ? "index.php" : "notes.php";
  const proposed = `http://127.0.0.1:8091/pages/${filename}`;
  let pendingId = null;
  if (featured) {
    const remember = deps.recordPending || recordPending;
    const pending = await remember({
      tool: "publish_to_site",
      args: { slug, title, body: featured.slice(0, 4000) },
      trace: [
        { tool: "find_page", ok: Boolean(foundPage.ok), output: String(foundPage.stdout || foundPage.error || "").slice(0, 500) },
        { tool: "read_page", ok: Boolean(read.ok), output: featured.slice(0, 800) },
      ],
    });
    pendingId = pending.id;
  }
  const save = deps.save || saveToDb;
  const saved = await save({
    url,
    title,
    content: featured.slice(0, 8000) || "(no text)",
    asked: prompt,
    found: featured.slice(0, 1500),
    published: pendingId ? `pending:${pendingId} ${proposed}` : "",
  }, deps);
  return {
    ok: Boolean(featured),
    url,
    homepage,
    found: featured.slice(0, 1000),
    pending_id: pendingId,
    proposed_url: pendingId ? proposed : "",
    finding_id: saved.id,
    error: featured ? null : (read.error || foundPage.error || "empty page"),
  };
}
