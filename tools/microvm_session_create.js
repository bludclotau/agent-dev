// /opt/snerloc/agent/tools/microvm_session_create.js
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
} = require("./lib/shared");

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validates and coerces raw params for microvm_session_create.
 * Throws with err.code === INVALID_PARAMS on any failure.
 *
 * @param {object} raw
 * @returns {object} Validated and defaulted params.
 */
function validate(raw) {
  const errors = [];

  // session_name — optional, but must be safe if provided
  if (raw.session_name !== undefined && raw.session_name !== null) {
    if (typeof raw.session_name !== "string" || !SESSION_NAME_RE.test(raw.session_name)) {
      errors.push(`session_name must match ${SESSION_NAME_RE}`);
    }
  }

  // idle_ttl_seconds
  if (raw.idle_ttl_seconds !== undefined) {
    const n = Number(raw.idle_ttl_seconds);
    const { min, max } = LIMITS.idle_ttl;
    if (!Number.isInteger(n) || n < min || n > max) {
      errors.push(`idle_ttl_seconds must be an integer between ${min} and ${max}`);
    }
  }

  // Common: cpu, ram, timeout, image, working_dir, idempotency_key, env_vars, tags
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

/**
 * Build the full argv for `microvm-remote-run --create-session`.
 *
 * @param {ReturnType<validate>} p
 * @returns {string[]}
 */
function buildArgs(p) {
  const args = ["--create-session"];

  if (p.session_name) {
    args.push("--session-name", p.session_name);
  }

  args.push("--idle-ttl", String(p.idle_ttl_seconds));

  // Appends: --cpu --ram --image --timeout --workdir --env --tag
  appendCommonArgs(args, p);

  return args;
}

// ─── Result parser ────────────────────────────────────────────────────────────

/**
 * Parse the session_create response envelope.
 *
 * The binary emits a single JSON object on stdout:
 *   {
 *     "session_id":       "sess-abc123",
 *     "vm_id":            "vm-xyz789",
 *     "boot_seconds":     3.42,
 *     "idle_ttl_seconds": 900,
 *     "expires_at":       "2026-04-13T04:20:00Z"
 *   }
 *
 * On non-zero exit the binary writes an error to stderr; we surface that as an
 * EXECUTION_FAILED envelope so the caller gets a consistent error shape.
 *
 * @param {{ stdout: string, stderr: string, exitCode: number, runtimeSeconds: number }} ctx
 * @returns {object} Session result or error envelope.
 */
function parseSessionCreateResult({ stdout, stderr, exitCode, runtimeSeconds }) {
  if (exitCode !== 0) {
    return errorResult(
      ErrorCode.EXECUTION_FAILED,
      stderr.trim() || `microvm-remote-run exited with code ${exitCode}`,
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
    // Prefer the binary's reported boot time; fall back to our wall-clock measurement.
    boot_seconds:     d.boot_seconds     ?? Math.round(runtimeSeconds * 1000) / 1000,
    idle_ttl_seconds: d.idle_ttl_seconds ?? null,
    expires_at:       d.expires_at       ?? null,
  };
}

// ─── Core executor ────────────────────────────────────────────────────────────

/**
 * Boot a persistent micro-VM session and return a session_id.
 *
 * The VM remains running until microvm_session_destroy is called or the idle
 * TTL expires.  Use this as the first step in any multi-command workflow to
 * avoid paying the VM boot cost on each step.
 *
 * @param {object}  params
 * @param {string}  [params.session_name]      - Human-readable label (1–64 chars).
 * @param {number}  [params.idle_ttl_seconds]  - Auto-destroy after N idle seconds (60–86400). Default: 900.
 * @param {number}  [params.cpu=1]             - vCPUs (1–8).
 * @param {number}  [params.ram=1024]          - RAM in MB (256–16384).
 * @param {string}  [params.image]             - Base image name.
 * @param {number}  [params.timeout=120]       - SSH-ready timeout in seconds (10–600).
 * @param {object}  [params.env_vars]          - Session-wide environment variables.
 * @param {string}  [params.working_dir]       - Default working directory inside the VM.
 * @param {object}  [params.tags]              - Arbitrary key-value labels.
 *
 * @returns {Promise<object>} Session result envelope or error envelope.
 */
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
