// /opt/snerloc/agent/tools/microvm_session_create.js
"use strict";

const {
  ErrorCode,
  LIMITS,
  validateSessionName,
  validateCommonFields,
  applyCommonDefaults,
  appendCreateSessionArgs,
  errorResult,
  spawnExecutor,
} = require("./lib/shared.cjs");

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  if (raw.session_name !== undefined && raw.session_name !== null) {
    validateSessionName(raw, errors);
  }

  if (raw.idle_ttl !== undefined) {
    const n = Number(raw.idle_ttl);
    const { min, max } = LIMITS.idle_ttl;
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`idle_ttl must be an integer between ${min} and ${max}`);
    }
  }

  validateCommonFields(raw, errors);

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_name: raw.session_name ?? null,
    idle_ttl: raw.idle_ttl !== undefined ? Number(raw.idle_ttl) : 900,
    ...applyCommonDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = [
    "--session-create",
    "--session-name", p.session_name,
    "--idle-ttl", String(p.idle_ttl),
    "--cpu", String(p.cpu),
    "--ram", String(p.ram),
    "--image", p.image,
    "--timeout", String(p.timeout),
  ];

  appendCreateSessionArgs(args, p);

  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function microvmSessionCreate(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), {
    timeout: p.timeout,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionCreate;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS = LIMITS;