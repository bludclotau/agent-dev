// /opt/snerloc/agent/tools/microvm_run_script.js
"use strict";

const fs   = require("fs/promises");
const os   = require("os");
const path = require("path");

const {
  ErrorCode,
  LIMITS,
  validateCommonFields,
  applyCommonDefaults,
  appendCommonArgs,
  errorResult,
  randomTmpName,
  spawnExecutor,
} = require("./lib/shared");

// ─── Tool-specific constants ──────────────────────────────────────────────────

const ALLOWED_INTERPRETERS = ["bash", "sh", "python3", "python"];

/** Max script size accepted before we reject locally. */
const MAX_SCRIPT_BYTES = 512 * 1024; // 512 KB

/**
 * Maps each interpreter to the file extension and shebang line prepended to
 * the script before it is written to disk.  The schema promises callers that
 * the shebang is added automatically, so we honour that here.
 */
const INTERPRETER_META = Object.freeze({
  bash:    { ext: ".sh",  shebang: "#!/usr/bin/env bash\nset -euo pipefail\n" },
  sh:      { ext: ".sh",  shebang: "#!/bin/sh\nset -eu\n" },
  python3: { ext: ".py",  shebang: "#!/usr/bin/env python3\n" },
  python:  { ext: ".py",  shebang: "#!/usr/bin/env python\n" },
});

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates and coerces raw params for microvm_run_script.
 * Throws with err.code === INVALID_PARAMS on any failure.
 *
 * @param {object} raw
 * @returns {object} Validated and defaulted params.
 */
function validate(raw) {
  const errors = [];

  // script
  if (typeof raw.script !== "string" || raw.script.trim().length === 0) {
    errors.push("script must be a non-empty string");
  } else if (Buffer.byteLength(raw.script, "utf8") > MAX_SCRIPT_BYTES) {
    errors.push(`script exceeds the ${MAX_SCRIPT_BYTES / 1024} KB size limit`);
  }

  // interpreter
  if (raw.interpreter !== undefined && !ALLOWED_INTERPRETERS.includes(raw.interpreter)) {
    errors.push(`interpreter must be one of: ${ALLOWED_INTERPRETERS.join(", ")}`);
  }

  // common fields (cpu, ram, timeout, image, working_dir, idempotency_key, env_vars, tags)
  validateCommonFields(raw, errors);

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    script:      raw.script.trim(),
    interpreter: raw.interpreter ?? "bash",
    ...applyCommonDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

/**
 * Build the full argv for `microvm-remote-run` in script mode.
 * Values are always discrete argv entries — no shell interpolation.
 *
 * @param {ReturnType<validate>} p
 * @param {string}               scriptPath - Host path to the temp script file.
 * @returns {string[]}
 */
function buildArgs(p, scriptPath) {
  const args = [
    "--script",      scriptPath,
    "--interpreter", p.interpreter,
  ];
  appendCommonArgs(args, p);
  return args;
}

// ─── Script file management ───────────────────────────────────────────────────

/**
 * Write the script to a secure, randomly-named temp file.
 *
 * - Uses crypto.randomBytes (via randomTmpName) for an unpredictable filename.
 * - Sets mode 0o600 so only the agent process user can read or execute it.
 * - Prepends the correct shebang line for the chosen interpreter.
 * - Uses an async write to avoid blocking the event loop.
 *
 * @param {string} script
 * @param {string} interpreter
 * @returns {Promise<string>} Absolute path to the temp file.
 */
async function writeTempScript(script, interpreter) {
  const { ext, shebang } = INTERPRETER_META[interpreter];
  const filename   = randomTmpName("microvm-script", ext);
  const scriptPath = path.join(os.tmpdir(), filename);
  const content    = shebang + script;

  await fs.writeFile(scriptPath, content, { mode: 0o600 });
  return scriptPath;
}

/**
 * Remove the temp script file, swallowing errors (e.g. already deleted).
 * Called from the spawnExecutor onSettle callback so cleanup always runs
 * regardless of how the execution ends.
 *
 * @param {string} scriptPath
 */
async function removeTempScript(scriptPath) {
  try {
    await fs.unlink(scriptPath);
  } catch {
    // Best-effort.  A leaked temp file is not a correctness issue.
  }
}

// ─── Core executor ────────────────────────────────────────────────────────────

/**
 * Execute a multi-line script inside a fresh ephemeral micro-VM.
 *
 * The script is written to a secure temp file on the host, transferred into
 * the VM by `microvm-remote-run`, executed under the chosen interpreter, and
 * the temp file is cleaned up unconditionally when the process exits.
 *
 * @param {object} params - Raw params matching the microvm_run_script JSON schema.
 * @param {string} params.script            - Multi-line script body (no shebang).
 * @param {string} [params.interpreter]     - "bash" | "sh" | "python3" | "python". Default: "bash".
 * @param {number} [params.cpu=1]           - vCPUs (1–8).
 * @param {number} [params.ram=1024]        - RAM in MB (256–16384).
 * @param {string} [params.image]           - Base image name.
 * @param {number} [params.timeout=120]     - SSH-ready timeout in seconds.
 * @param {object} [params.env_vars]        - Environment variables to inject.
 * @param {string} [params.working_dir]     - Absolute working directory inside the VM.
 * @param {string} [params.idempotency_key] - Cache key for idempotent replay.
 * @param {object} [params.tags]            - Arbitrary key-value labels.
 *
 * @returns {Promise<object>} Result envelope as defined by the vm_result schema.
 */
async function microvmRunScript(params) {
  // Validate ──────────────────────────────────────────────────────────────────
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  // Write temp script ─────────────────────────────────────────────────────────
  let scriptPath;
  try {
    scriptPath = await writeTempScript(p.script, p.interpreter);
  } catch (err) {
    return errorResult(ErrorCode.TEMP_FILE_ERROR, `Failed to write temp script: ${err.message}`);
  }

  // Spawn ─────────────────────────────────────────────────────────────────────
  return spawnExecutor(buildArgs(p, scriptPath), {
    timeout: p.timeout,
    // onSettle runs after the process exits and before the Promise resolves,
    // guaranteeing the temp file is removed regardless of outcome.
    onSettle: () => removeTempScript(scriptPath),
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmRunScript;

// Named exports for unit testing individual pieces without spawning a process.
module.exports.validate         = validate;
module.exports.buildArgs        = buildArgs;
module.exports.writeTempScript  = writeTempScript;
module.exports.removeTempScript = removeTempScript;
module.exports.ErrorCode        = ErrorCode;
module.exports.LIMITS           = LIMITS;
module.exports.INTERPRETER_META = INTERPRETER_META;
module.exports.ALLOWED_INTERPRETERS = ALLOWED_INTERPRETERS;
