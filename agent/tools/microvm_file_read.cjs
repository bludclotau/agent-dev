// /opt/snerloc/agent/tools/microvm_file_read.js
"use strict";

const {
  ErrorCode,
  LIMITS,
  validateSessionId,
  errorResult,
  spawnExecutor,
} = require("./lib/shared.cjs");

// ─── Validation ──────────────────────────────────────────────────────────────

const MAX_BYTES_DEFAULT = 1024 * 1024;
const MAX_BYTES_HARD = 10 * 1024 * 1024;

function validate(raw) {
  const errors = [];

  validateSessionId(raw, errors);

  if (typeof raw.path !== "string" || raw.path.length === 0) {
    errors.push("path must be a non-empty string");
  }

  if (raw.encoding !== undefined && !["utf-8", "base64"].includes(raw.encoding)) {
    errors.push('encoding must be "utf-8" or "base64"');
  }

  if (raw.max_bytes !== undefined) {
    const n = Number(raw.max_bytes);
    if (!Number.isInteger(n) || n <= 0 || n > MAX_BYTES_HARD) {
      errors.push(`max_bytes must be a positive integer up to ${MAX_BYTES_HARD}`);
    }
  }

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_id: raw.session_id,
    path: raw.path,
    encoding: raw.encoding ?? "utf-8",
    max_bytes: raw.max_bytes ?? MAX_BYTES_DEFAULT,
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = [
    "--file-read",
    "--session-id", p.session_id,
    "--path", p.path,
    "--encoding", p.encoding,
    "--max-bytes", String(p.max_bytes),
  ];

  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function microvmFileRead(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), { timeout: 60 });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmFileRead;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS = LIMITS;