import { LLM_COMPLETION_URL } from "./config.js";
import { TOOL_GRAMMAR } from "./grammar.js";
import { SEED, assemblePrompt, selectFragments } from "./fragments.js";

export function buildPrompt(goal, steps, fragments = SEED) {
  return assemblePrompt(selectFragments(goal, fragments), goal, steps);
}

export async function complete(prompt, { grammar = TOOL_GRAMMAR, fetchImpl = fetch, timeoutMs = 90000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(LLM_COMPLETION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        n_predict: 180,
        temperature: 0,
        grammar,
      }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (!response.ok) throw new Error(`LLM ${response.status}: ${raw.slice(0, 300)}`);
    const data = JSON.parse(raw);
    return String(data.content || "").trim();
  } finally {
    clearTimeout(timer);
  }
}
