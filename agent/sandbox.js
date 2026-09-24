// Runs a fixed command inside the repo's microvm session executor.
// The model never sees this layer and never supplies the command string.
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
process.env.MICROVM_EXECUTOR = process.env.MICROVM_EXECUTOR
  || path.join(here, "../microvm/microvm-run");

const createSession = require("./tools/microvm_session_create.cjs");
const execSession = require("./tools/microvm_session_exec.cjs");
const destroySession = require("./tools/microvm_session_destroy.cjs");

function sessionIdFrom(result) {
  const line = String(result.stdout || "").trim().split("\n").filter(Boolean).pop();
  if (!line) throw new Error(result.message || "microvm session create returned no session");
  const parsed = JSON.parse(line);
  if (!parsed.session_id) throw new Error(parsed.message || "microvm session id missing");
  return parsed.session_id;
}

export async function runInSandbox(command, deps = {}) {
  const create = deps.create || createSession;
  const exec = deps.exec || execSession;
  const destroy = deps.destroy || destroySession;
  const created = await create({ session_name: "wendy", cpu: 1, ram: 512, timeout: 60 });
  if (created.error) throw new Error(created.message || created.error);
  const sessionId = sessionIdFrom(created);
  try {
    const ran = await exec({ session_id: sessionId, command, exec_timeout: 60 });
    if (ran.error) return { ok: false, error: ran.message || ran.error, session_id: sessionId };
    const stdout = String(ran.stdout || "");
    let payload = null;
    try {
      payload = JSON.parse(stdout.trim().split("\n").filter(Boolean).pop());
    } catch {
      payload = null;
    }
    const text = payload && typeof payload.stdout === "string" ? payload.stdout : stdout;
    const code = payload && payload.exit_code != null ? payload.exit_code : ran.exit_code;
    return { ok: code === 0 || code == null, stdout: text, session_id: sessionId, exit_code: code };
  } finally {
    await destroy({ session_id: sessionId }).catch(() => {});
  }
}
