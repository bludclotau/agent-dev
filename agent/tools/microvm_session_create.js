"use strict";

const {
  ErrorCode,
  LIMITS,
  SESSION_NAME_RE,
  validateCommonFields,
  applyCommonDefaults,
  appendCommonArgs,
  errorResult,
  parseJsonOutput,
  spawnExecutor,
} = require("./lib/shared.js");

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  if (raw.session_name !== undefined && raw.session_name !== null) {
    if (typeof raw.session_name !== "string" || !SESSION_NAME_RE.test(raw.session_name)) {
      errors.push(`session_name must match ${SESSION_NAME_RE}`);
    }
  }

  if (raw.idle_ttl_seconds !== undefined) {
    const n = Number(raw.idle_ttl_seconds);
    const { min, max } = LIMITS.idle_ttl;
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`idle_ttl_seconds must be an integer between ${min} and ${max}`);
    }
  }

  validateCommonFields(raw, errors);

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    session_name:     raw.session_name  ?? null,
    idle_ttl_seconds: raw.idle_ttl_seconds !== undefined
      ? Number(raw.idle_ttl_seconds)
      : 900,
    ...applyCommonDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = ["--session-create"];

  if (p.session_name) {
    args.push("--session-name", p.session_name);
  }

  args.push("--idle-ttl", String(p.idle_ttl_seconds));

  appendCommonArgs(args, p);

  return args;
}

// ─── Result parser ────────────────────────────────────────────────────────────

function parseSessionCreateResult({ stdout, stderr, exitCode, runtimeSeconds }) {
  if (exitCode !== 0) {
    return errorResult(
      ErrorCode.EXECUTION_FAILED,
      stderr.trim() || `microvm-run exited with code ${exitCode}`,
    );
  }

  const parsed = parseJsonOutput(stdout);
  if (!parsed.ok) {
    return errorResult(
      ErrorCode.PARSE_ERROR,
      `Failed to parse session_create response — raw output: ${parsed.raw.slice(0, 256)}`,
    );
  }

  const d = parsed.data;
  return {
    session_id:       d.session_id       ?? null,
    vm_id:            d.vm_id            ?? null,
    boot_seconds:     d.boot_seconds     ?? Math.round(runtimeSeconds * 1000) / 1000,
    idle_ttl_seconds: d.idle_ttl_seconds ?? null,
    expires_at:       d.expires_at       ?? null,
  };
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
    timeout:      p.timeout,
    parseSuccess: parseSessionCreateResult,
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmSessionCreate;
module.exports.validate                = validate;
module.exports.buildArgs               = buildArgs;
module.exports.parseSessionCreateResult = parseSessionCreateResult;
module.exports.ErrorCode               = ErrorCode;
module.exports.LIMITS                  = LIMITS;