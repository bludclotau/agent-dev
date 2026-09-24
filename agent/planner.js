import { MAX_STEPS } from "./config.js";
import { grammarFor, parseCall } from "./grammar.js";
import { complete } from "./llm.js";
import { executeWendyTool } from "./pipeline.js";
import { SEED, assemblePrompt, selectFragments, toolsFor } from "./fragments.js";
import { recordPending } from "./approvals.js";

const GUARDED = new Set(["publish_to_site"]);

export async function plan(goal, opts = {}) {
  if (!goal || !String(goal).trim()) return { ok: false, error: "goal is required" };
  const stepsAllowed = Math.max(1, Math.min(Number(opts.maxSteps || 4), MAX_STEPS));
  const infer = opts.complete || ((prompt, callOpts) => complete(prompt, callOpts));
  const act = opts.execute || ((call) => executeWendyTool(call, opts));
  const remember = opts.recordPending || recordPending;
  const library = opts.fragments || SEED;
  const selected = selectFragments(goal, library);
  const allowed = toolsFor(selected);
  const grammar = grammarFor(allowed);
  const trace = [];
  for (let i = 0; i < stepsAllowed; i += 1) {
    const raw = await infer(assemblePrompt(selected, goal, trace), { grammar });
    const call = parseCall(raw, allowed);
    if (call.tool === "done") {
      return { ok: true, final: String(call.args.text || ""), steps: trace, tools: allowed };
    }
    if (GUARDED.has(call.tool)) {
      const pending = await remember({ tool: call.tool, args: call.args, trace });
      trace.push({ tool: call.tool, ok: false, output: "awaiting approval" });
      return { ok: false, pending: true, id: pending.id, error: "awaiting approval", steps: trace, tools: allowed };
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
