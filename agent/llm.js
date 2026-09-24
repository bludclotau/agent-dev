import { LLM_COMPLETION_URL } from "./config.js";
import { PLAN_TOOLS, TOOL_GRAMMAR } from "./grammar.js";

export function buildPrompt(goal, steps) {
  const history = JSON.stringify(steps).slice(0, 6000);
  return [
    "You are Wendy. You find a page, read it, save the useful part, and publish only when asked.",
    `Goal: ${goal}`,
    `Allowed tools: ${PLAN_TOOLS.join(", ")}.`,
    "find_page takes query or url. read_page takes url. save_to_db takes url, title, and content.",
    "publish_to_site takes slug, title, and body. slug is a name from the allowlist, not a filesystem path.",
    "When the goal is finished, call done with args text set to a short answer.",
    `Previous steps: ${history}`,
    "Reply with one JSON object.",
    "Assistant:",
  ].join("\n");
}

export async function complete(prompt, { fetchImpl = fetch, timeoutMs = 90000 } = {}) {
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
        grammar: TOOL_GRAMMAR,
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
