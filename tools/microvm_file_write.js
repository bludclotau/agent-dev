"use strict";

const {
  ErrorCode,
  SESSION_ID_RE,
  validateSessionId,
  errorResult,
  spawnExecutor,
} = require("./lib/shared");

const MAX_CONTENT_BYTES = 2 * 1024 * 1024; // 2 MB

function validate(raw) {
  const errors = [];

  // session_id or vm_id — exactly one must be provided
  const hasSession = typeof raw.session_id === "string";
  const hasVm      = typeof raw.vm_id === "string";

  if (!hasSession && !hasVm) {
    errors.push("either session_id or vm_id must be provided");
  }
  if (hasSession && hasVm) {
    errors.push("only one of session_id or vm_id may be provided");
  }

  // path
  if (typeof raw.path !== "string" || !raw.path.startsWith("/")) {
    errors.push("path must be an absolute string");
  }

  // content
  if (typeof raw.content !== "string" || raw.content.length === 0) {
    errors.push("content must be a non-empty string");
  } else if (Buffer.byteLength(raw.content, "utf8") > MAX_CONTENT_BYTES &&
             raw.encoding !== "base64") {
    errors.push(`content exceeds ${MAX_CONTENT_BYTES / 1024} KB; use base64 for larger binary blobs`);
  }

  // encoding
  if (raw.encoding !== undefined && !["utf-8", "base64"].includes(raw.encoding)) {
    errors.push('encoding must be "utf-8" or "base64"');
  }

  // mode
  if (raw.mode !== undefined && !/^0[0-7]{3}$/.test(raw.mode)) {
    errors.push('mode must be a string like "0644"');
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
    content:    raw.content,
    encoding:   raw.encoding ?? "utf-8",
    mode:       raw.mode ?? "0644",
  };
}

function buildArgs(p) {
  const args = [
    "--file-write",
    "--path", p.path,
    "--encoding", p.encoding,
    "--mode", p.mode,
  ];

  if (p.session_id) {
    args.push("--session-id", p.session_id);
  } else {
    args.push("--vm-id", p.vm_id);
  }

  // Tell the binary to read content from stdin
  args.push("--stdin-content");

  return { args, stdin: p.content };
}

async function microvmFileWrite(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  const { args, stdin } = buildArgs(p);

  return spawnExecutor(args, {
    timeout: 60,
    stdin,
  });
}

module.exports = microvmFileWrite;
module.exports.validate = validate;
module.exports.buildArgs = buildArgs;
