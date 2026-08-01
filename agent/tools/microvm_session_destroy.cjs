// /opt/snerloc/agent/tools/microvm_session_destroy.js
"use strict";

const {
  ErrorCode,
  validateSessionId,
  errorResult,
  spawnExecutor,
} = require("./lib/shared.cjs");

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  validateSessionId(raw, errors);

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_id: raw.session_id,
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = ["--session-destroy", p.session_id];
  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function microvmSessionDestroy(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), { timeout: 30 });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionDestroy;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;