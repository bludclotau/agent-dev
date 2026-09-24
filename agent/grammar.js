// llama.cpp GBNF. Wendy can emit one tool call from this set and nothing else.
export const PLAN_TOOLS = [
  "find_page",
  "read_page",
  "save_to_db",
  "publish_to_site",
  "done",
];

const GRAMMAR_TAIL = String.raw`
object ::= "{" ws "}" | "{" ws members ws "}"
members ::= pair (ws "," ws pair)*
pair ::= string ws ":" ws string
string ::= "\"" chars "\""
chars ::= char*
char ::= [^"\\] | "\\" (["\\/bfnrt] | "u" hex hex hex hex)
hex ::= [0-9a-fA-F]
ws ::= [ \t\n]*
`.trim();

export function grammarFor(tools) {
  const names = PLAN_TOOLS.filter((name) => new Set([...(tools || []), "done"]).has(name));
  const toolname = names.map((name) => `"\\"${name}\\""`).join(" | ");
  return [
    String.raw`root ::= "{" ws "\"tool\"" ws ":" ws toolname ws "," ws "\"args\"" ws ":" ws object ws "}"`,
    `toolname ::= ${toolname}`,
    GRAMMAR_TAIL,
  ].join("\n");
}

export const TOOL_GRAMMAR = grammarFor(PLAN_TOOLS);

export function parseCall(raw, allowed = PLAN_TOOLS) {
  let call;
  try {
    call = JSON.parse(raw);
  } catch {
    throw new Error(`planner returned non-JSON: ${String(raw).slice(0, 180)}`);
  }
  const tool = call.tool;
  const args = call.args && typeof call.args === "object" && !Array.isArray(call.args) ? call.args : {};
  const permit = new Set(allowed);
  permit.add("done");
  if (!permit.has(tool)) throw new Error(`planner chose ${tool}`);
  return { tool, args };
}
