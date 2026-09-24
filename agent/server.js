import http from "http";
import { timingSafeEqual } from "crypto";
import { decide, listPending } from "./approvals.js";
import { runChatChain } from "./chain.js";
import { ensureFragments } from "./fragments.js";

function authorized(req) {
  const expected = process.env.TOOL_API_TOKEN || process.env.WENDY_API_TOKEN || "";
  if (!expected) return false;
  const header = req.headers.authorization || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const provided = bearer || req.headers["x-tool-token"] || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body) {
  const raw = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(raw);
}

const server = http.createServer(async (req, res) => {
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });
  const url = new URL(req.url, "http://127.0.0.1");
  try {
    if (req.method === "GET" && url.pathname === "/pending") {
      return send(res, 200, { pending: await listPending() });
    }
    if (req.method === "POST" && url.pathname === "/pipeline") {
      const body = await readBody(req);
      if (!body.url) return send(res, 400, { error: "url is required" });
      return send(res, 200, await runChatChain({ prompt: body.prompt || body.url, url: body.url }));
    }
    const match = url.pathname.match(/^\/pending\/(\d+)\/(approve|reject)$/);
    if (req.method === "POST" && match) {
      const status = match[2] === "approve" ? "approved" : "rejected";
      const result = await decide(Number(match[1]), status);
      return send(res, result.ok ? 200 : 400, result);
    }
    return send(res, 404, { error: "not found" });
  } catch (err) {
    return send(res, 500, { error: err.message });
  }
});

const port = Number(process.env.WENDY_API_PORT || 8790);
ensureFragments().then(() => {
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`wendy approvals http://127.0.0.1:${port}\n`);
  });
}).catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
