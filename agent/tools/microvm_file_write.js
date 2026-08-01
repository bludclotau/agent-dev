// /opt/snerloc/agent/tools/microvm_file_write.js
"use strict";

const {
  ErrorCode,
  LIMITS,
  validateSessionId,
  errorResult,
  spawnExecutor,
} = require("./lib/shared.js");

// ─── Validation ──────────────────────────────────────────────────────────────

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

function validate(raw) {
  const errors = [];

  validateSessionId(raw, errors);

  if (typeof raw.path !== "string" || raw.path.length === 0) {
    errors.push("path must be a non-empty string");
  }

  if (typeof raw.content !== "string" || raw.content.length === 0) {
    errors.push("content must be a non-empty string");
  } else if (Buffer.byteLength(raw.content, "utf8") > MAX_CONTENT_BYTES && raw.encoding !== "base64") {
    errors.push(`content exceeds ${MAX_CONTENT_BYTES} bytes; use base64 for larger blobs`);
  }

  if (raw.encoding !== undefined && !["utf-8", "base64"].includes(raw.encoding)) {
    errors.push('encoding must be "utf-8" or "base64"');
  }

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_id: raw.session_id,
    path: raw.path,
    content: raw.content,
    encoding: raw.encoding ?? "utf-8",
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = [
    "--file-write",
    "--session-id", p.session_id,
    "--path", p.path,
    "--encoding", p.encoding,
  ];

  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

async function microvmFileWrite(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), {
    timeout: 60,
    stdin: p.content,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmFileWrite;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS = LIMITS;