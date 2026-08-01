import { execFile } from "child_process";

export async function remote_shell({ command, confirmed = false, target = "" }) {
  return new Promise((resolve, reject) => {
    const script = "/opt/snerloc/tools/remote_shell.sh";

    // Validate target is numeric if provided
    if (target && !/^\d+$/.test(String(target))) {
      return reject({ error: "Invalid target: must be a numeric container ID." });
    }

    // Build args array — execFile passes these directly, no shell interpretation
    const args = [];
    if (confirmed) args.push("--confirmed");
    if (target)    args.push("--target", String(target));
    args.push(command); // passed as a single argument, injection-safe

    execFile(script, args, { timeout: 60_000 }, (error, stdout, stderr) => {
      const out = (stdout || "").trim();
      const err = (stderr || "").trim();

      if (error) {
        const exitCode = error.code;

        // Differentiate the script's exit codes for the agent to reason about
        if (exitCode === 2) {
          return reject({
            error: "TIER2_UNCONFIRMED",
            message: "Destructive command blocked — confirmed flag not set. " +
                     "Present the exact command to the user and wait for explicit approval.",
            command,
            stderr: err
          });
        }

        if (exitCode === 1) {
          return reject({
            error: "COMMAND_NOT_PERMITTED",
            message: "Command did not match any allowed pattern in remote_shell.sh.",
            command,
            stderr: err
          });
        }

        // SSH failure, timeout, or other runtime error
        return reject({
          error: "EXECUTION_FAILED",
          exitCode,
          message: error.message,
          stderr: err
        });
      }

      resolve({ stdout: out, stderr: err });
    });
  });
}
