import { MAX_STEPS } from "./config.js";
import { parseCall } from "./grammar.js";
import { buildPrompt, complete } from "./llm.js";
import { executeWendyTool } from "./pipeline.js";

const GUARDED = new Set(["publish_to_site"]);

export async function plan(goal, opts = {}) {
  if (!goal || !String(goal).trim()) return { ok: false, error: "goal is required" };
  const stepsAllowed = Math.max(1, Math.min(Number(opts.maxSteps || 4), MAX_STEPS));
  const infer = opts.complete || complete;
  const act = opts.execute || ((call) => executeWendyTool(call, opts));
  const confirm = opts.confirm || (async () => false);
  const trace = [];
  for (let i = 0; i < stepsAllowed; i += 1) {
    const raw = await infer(buildPrompt(goal, trace));
    const call = parseCall(raw);
    if (call.tool === "done") {
      return { ok: true, final: String(call.args.text || ""), steps: trace };
    }
    if (GUARDED.has(call.tool)) {
      const allowed = await confirm(call);
      if (!allowed) {
        trace.push({ tool: call.tool, ok: false, output: "confirmation denied" });
        return { ok: false, error: "confirmation denied", steps: trace };
      }
    }
    const result = await act(call);
    trace.push({
      tool: call.tool,
      ok: Boolean(result.ok),
      output: String(result.stdout || result.error || result.final || "").slice(0, 2000),
    });
    if (!result.ok) return { ok: false, error: result.error || "tool failed", steps: trace };
  }
  return { ok: false, error: "max steps", steps: trace };
}
