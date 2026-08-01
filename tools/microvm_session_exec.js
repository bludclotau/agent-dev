// /opt/snerloc/agent/tools/microvm_session_exec.js
"use strict";

const {
  ErrorCode,
  LIMITS,
  validateSessionId,
  applyExecDefaults,
  appendExecSessionArgs,
  errorResult,
  spawnExecutor,
} = require("./lib/shared");

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates and coerces raw params for microvm_session_exec.
 *
 * Intentionally narrow: session_exec targets a running VM that already has its
 * cpu/ram/image/env baked in.  Only working_dir and idempotency_key are
 * accepted as per-call overrides — accepting the full creation param set would
 * silently pass flags that the binary ignores in --exec-session mode.
 *
 * @param {object} raw
 * @returns {object} Validated and defaulted params.
 */
function validate(raw) {
  const errors = [];

  // session_id — required, must match the shared pattern
  validateSessionId(raw, errors);

  // command — required
  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    errors.push("command must be a non-empty string");
  }

  // exec_timeout — optional, controls this specific command's timeout
  if (raw.exec_timeout !== undefined) {
    const n = Number(raw.exec_timeout);
    const { min, max } = LIMITS.exec_timeout;
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`exec_timeout must be an integer between ${min} and ${max}`);
    }
  }

  // working_dir — optional override for this call
  if (raw.working_dir !== undefined) {
    if (typeof raw.working_dir !== "string" || !raw.working_dir.startsWith("/")) {
      errors.push("working_dir must be an absolute path string");
    }
  }

  // idempotency_key — optional
  if (raw.idempotency_key !== undefined && raw.idempotency_key !== null) {
    if (typeof raw.idempotency_key !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(raw.idempotency_key)) {
      errors.push("idempotency_key must be an alphanumeric string between 8 and 128 characters");
    }
  }

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_id:   raw.session_id,
    command:      raw.command.trim(),
    exec_timeout: raw.exec_timeout !== undefined ? Number(raw.exec_timeout) : 300,
    ...applyExecDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

/**
 * Build the full argv for `microvm-remote-run --exec-session`.
 *
 * Only pushes flags that --exec-session accepts.  Critically, does NOT push
 * --cpu / --ram / --image / --env / --tag — those are session-level settings
 * already baked into the running VM and would cause the binary to error.
 *
 * @param {ReturnType<validate>} p
 * @returns {string[]}
 */
function buildArgs(p) {
  const args = [
    "--exec-session",  p.session_id,
    "--exec-timeout",  String(p.exec_timeout),
  ];

  // Appends: --workdir and (optionally) --idempotency-key
  appendExecSessionArgs(args, p);

  // Explicit end-of-options separator so the command cannot be misread as a flag.
  args.push("--", p.command);

  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

/**
 * Execute a command inside an existing persistent session.
 *
 * The session's filesystem, running processes, and environment persist between
 * calls.  Returns the same vm_result envelope as microvm_run.
 *
 * @param {object}  params
 * @param {string}  params.session_id          - Target session (required).
 * @param {string}  params.command             - Shell command to run (required).
 * @param {number}  [params.exec_timeout=300]  - Seconds to wait for this command (1–3600).
 * @param {string}  [params.working_dir]       - Override working directory for this call.
 * @param {string}  [params.idempotency_key]   - Cache key for idempotent replay.
 *
 * @returns {Promise<object>} vm_result envelope or error envelope.
 */
async function microvmSessionExec(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), {
    // Use exec_timeout for the watchdog — not a VM boot timeout.
    // The VM is already running; the watchdog must reflect command duration.
    timeout: p.exec_timeout,
    // No parseSuccess override — the binary emits the standard vm_result JSON
    // envelope for --exec-session, so successResult is correct.
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionExec;
module.exports.validate  = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS    = LIMITS;
