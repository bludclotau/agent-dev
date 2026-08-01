// /opt/snerloc/agent/tools/microvm_run.js
"use strict";

const {
  ErrorCode,
  LIMITS,
  validateCommonFields,
  applyCommonDefaults,
  appendCommonArgs,
  errorResult,
  spawnExecutor,
} = require("./lib/shared");

// ─── Validation ──────────────────────────────────────────────────────────────

function validate(raw) {
  const errors = [];

  if (typeof raw.command !== "string" || raw.command.trim().length === 0) {
    errors.push("command must be a non-empty string");
  }

  validateCommonFields(raw, errors);

  if (errors.length > 0) {
    const err = new Error(errors.join("; "));
    err.code = ErrorCode.INVALID_PARAMS;
    throw err;
  }

  return {
    command: raw.command.trim(),
    ...applyCommonDefaults(raw),
  };
}

// ─── Argument builder ─────────────────────────────────────────────────────────

function buildArgs(p) {
  const args = [];
  appendCommonArgs(args, p);
  // Explicit end-of-options separator so the command cannot be misread as a flag.
  args.push("--", p.command);
  return args;
}

// ─── Core executor ────────────────────────────────────────────────────────────

/**
 * Execute a single shell command inside a fresh ephemeral micro-VM.
 *
 * The VM is created, the command is run, and the VM is destroyed automatically.
 * For multi-step workflows that need shared state, use the session tools.
 *
 * @param {object} params
 * @param {string} params.command           - Shell command to run inside the VM.
 * @param {number} [params.cpu=1]           - vCPUs (1–8).
 * @param {number} [params.ram=1024]        - RAM in MB (256–16384).
 * @param {string} [params.image]           - Base image name.
 * @param {number} [params.timeout=120]     - SSH-ready timeout in seconds.
 * @param {object} [params.env_vars]        - Environment variables to inject.
 * @param {string} [params.working_dir]     - Absolute working directory inside the VM.
 * @param {string} [params.idempotency_key] - Cache key for idempotent replay.
 * @param {object} [params.tags]            - Arbitrary key-value labels.
 * @returns {Promise<object>}
 */
async function microvmRun(params) {
  let p;
  try {
    p = validate(params);
  } catch (err) {
    return errorResult(ErrorCode.INVALID_PARAMS, err.message);
  }

  return spawnExecutor(buildArgs(p), { timeout: p.timeout });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = microvmRun;
module.exports.validate  = validate;
module.exports.buildArgs = buildArgs;
module.exports.ErrorCode = ErrorCode;
module.exports.LIMITS    = LIMITS;
