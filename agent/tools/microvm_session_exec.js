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
} = require("./lib/shared.js");

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  validateSessionId(raw, errors);

  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    errors.push("command must be a non-empty string");
  }

  if (raw.exec_timeout !== undefined) {
    const n = Number(raw.exec_timeout);
    const { min, max } = LIMITS.exec_timeout;
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`exec_timeout must be an integer between ${min} and ${max}`);
    }
  }

  if (raw.working_dir !== undefined) {
    if (typeof raw.working_dir !== "string" || !raw.working_dir.startsWith("/")) {
      errors.push("working_dir must be an absolute path string");
    }
  }

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
    session_id: raw.session_id,
    command: raw.command.trim(),
    exec_timeout: raw.exec_timeout !== undefined ? Number(raw.exec_timeout) : 300,
    ...applyExecDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = [
    "--exec-session", p.session_id,
    "--exec-timeout", String(p.exec_timeout),
  ];

  appendExecSessionArgs(args, p);

  args.push("--", p.command);

  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function microvmSessionExec(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), {
    timeout: p.exec_timeout,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionExec;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS = LIMITS;