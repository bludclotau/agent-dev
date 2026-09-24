import { plan } from "./planner.js";
import { supervise } from "./supervisor.js";

export async function runWendy(goal, opts = {}) {
  return supervise(() => plan(goal, opts), {
    restarts: opts.restarts ?? 1,
    onCrash: opts.onCrash,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const goal = process.argv.slice(2).join(" ") || "Find https://example.com, read it, and stop.";
  runWendy(goal, {
    confirm: async (call) => {
      process.stderr.write(`confirm ${call.tool} ${JSON.stringify(call.args.slug || "")}? set WENDY_CONFIRM=yes\n`);
      return process.env.WENDY_CONFIRM === "yes";
    },
  }).then((result) => {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  }).catch((err) => {
    process.stderr.write(`${err.stack || err.message}\n`);
    process.exitCode = 1;
  });
}
