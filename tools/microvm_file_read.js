"use strict";

const {
  ErrorCode,
  errorResult,
  spawnExecutor,
} = require("./lib/shared");

const MAX_BYTES_DEFAULT = 1024 * 1024;      // 1 MB
const MAX_BYTES_HARD    = 10 * 1024 * 1024; // 10 MB

function validate(raw) {
  const errors = [];

  const hasSession = typeof raw.session_id === "string";
  const hasVm      = typeof raw.vm_id === "string";

  if (!hasSession && !hasVm) {
    errors.push("either session_id or vm_id must be provided");
  }
  if (hasSession && hasVm) {
    errors.push("only one of session_id or vm_id may be provided");
  }

  if (typeof raw.path !== "string" || !raw.path.startsWith("/")) {
    errors.push("path must be an absolute string");
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
    session_id: hasSession ? raw.session_id : null,
    vm_id:      hasVm ? raw.vm_id : null,
    path:       raw.path,
    encoding:   raw.encoding ?? "utf-8",
    max_bytes:  raw.max_bytes ?? MAX_BYTES_DEFAULT,
  };
}

function buildArgs(p) {
  const args = [
    "--file-read",
    "--path", p.path,
    "--encoding", p.encoding,
    "--max-bytes", String(p.max_bytes),
  ];

  if (p.session_id) {
    args.push("--session-id", p.session_id);
  } else {
    args.push("--vm-id", p.vm_id);
  }

  return args;
}

async function microvmFileRead(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), { timeout: 60 });
}

module.exports = microvmFileRead;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
