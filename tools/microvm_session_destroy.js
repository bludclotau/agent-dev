// /opt/snerloc/agent/tools/microvm_session_destroy.js
"use strict";

const {
  ErrorCode,
  SESSION_ID_RE,
  validateSessionId,
  errorResult,
  parseJsonOutput,
  spawnExecutor,
} = require("./lib/shared");

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates and coerces raw params for microvm_session_destroy.
 *
 * @param {object} raw
 * @returns {{ session_id: string, force: boolean }}
 */
function validate(raw) {
  const errors = [];

  validateSessionId(raw, errors);

  if (raw.force !== undefined && typeof raw.force !== "boolean") {
    errors.push("force must be a boolean");
  }

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_id: raw.session_id,
    force:      raw.force ?? false,
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

/**
 * Build the full argv for `microvm-remote-run --destroy-session`.
 *
 * @param {ReturnType<validate>} p
 * @returns {string[]}
 */
function buildArgs(p) {
  const args = ["--destroy-session", p.session_id];
  if (p.force) args.push("--force");
  return args;
}

// ─── Result parser ────────────────────────────────────────────────────────────

/**
 * Parse the session_destroy response envelope.
 *
 * The binary emits a single JSON object on stdout:
 *   {
 *     "session_id":        "sess-abc123",
 *     "destroyed":         true,
 *     "runtime_seconds":   120.5,
 *     "commands_executed": 14
 *   }
 *
 * A non-zero exit code is surfaced as EXECUTION_FAILED so the caller gets a
 * consistent error shape.  The most common cause is SESSION_NOT_FOUND, which
 * we detect from stderr and map to its own error code.
 *
 * @param {{ stdout: string, stderr: string, exitCode: number }} ctx
 * @returns {object} Destroy result or error envelope.
 */
function parseSessionDestroyResult({ stdout, stderr, exitCode }) {
  if (exitCode !== 0) {
    // Surface SESSION_NOT_FOUND as a distinct error code for callers to branch on.
    const isNotFound = /session.*(not found|unknown|does not exist)/i.test(stderr);
    return errorResult(
      isNotFound ? ErrorCode.SESSION_NOT_FOUND : ErrorCode.EXECUTION_FAILED,
      stderr.trim() || `microvm-remote-run exited with code ${exitCode}`,
    );
  }

  const parsed = parseJsonOutput(stdout);
  if (!parsed.ok) {
    return errorResult(
      ErrorCode.PARSE_ERROR,
      `Failed to parse session_destroy response — raw output: ${parsed.raw.slice(0, 256)}`,
    );
  }

  const d = parsed.data;
  return {
    session_id:        d.session_id        ?? null,
    destroyed:         d.destroyed         ?? false,
    runtime_seconds:   d.runtime_seconds   ?? null,
    commands_executed: d.commands_executed ?? null,
  };
}

// ─── Core executor ────────────────────────────────────────────────────────────

/**
 * Explicitly tear down a persistent session and release all associated
 * resources.  Always call this when a multi-step workflow is complete to avoid
 * idle resource usage.
 *
 * @param {object}  params
 * @param {string}  params.session_id  - Session to destroy (required).
 * @param {boolean} [params.force]     - If true, destroy even if a command is running. Default: false.
 *
 * @returns {Promise<object>} Destroy result or error envelope.
 */
async function microvmSessionDestroy(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), {
    // Destroy is a lightweight RPC — 30 seconds is generous.
    timeout:      30,
    parseSuccess: parseSessionDestroyResult,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionDestroy;
module.exports.validate                 = validate;
module.exports.buildArgs                = buildArgs;
module.exports.parseSessionDestroyResult = parseSessionDestroyResult;
module.exports.ErrorCode                = ErrorCode;
module.exports.SESSION_ID_RE            = SESSION_ID_RE;
