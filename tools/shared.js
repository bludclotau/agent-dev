// /opt/snerloc/agent/tools/lib/shared.js
"use strict";

/**
 * Shared constants, validators, parsers, result builders, and the core
 * spawn executor used by every microvm tool in this suite.
 *
 * Nothing in here is tool-specific. Each tool file only contains:
 *   1. Its own validate()   — checking fields unique to that tool.
 *   2. Its own buildArgs()  — assembling the argv for its binary verb.
 *   3. Any pre/post-spawn setup (e.g. temp file writing for run_script).
 *   4. A thin async wrapper that calls spawnExecutor().
 */

const { spawn }       = require("child_process");
const { randomBytes } = require("crypto");

// ─── Service constants ────────────────────────────────────────────────────────

const BINARY = "microvm-remote-run";
const CWD    = "/opt/snerloc/agent";

// ─── Schema limits (mirror the JSON schema exactly) ──────────────────────────

const LIMITS = Object.freeze({
  cpu:          { min: 1,    max: 8     },
  ram:          { min: 256,  max: 16384 },
  timeout:      { min: 10,   max: 600   },
  exec_timeout: { min: 1,    max: 3600  },
  idle_ttl:     { min: 60,   max: 86400 },
});

// ─── Output / timing constants ────────────────────────────────────────────────

/** Hard cap on combined stdout+stderr before killing the process. */
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Extra wall-clock seconds beyond the stated timeout before the watchdog kills
 * the host process.  Accounts for SSH negotiation, boot overhead, flush time.
 */
const PROCESS_TIMEOUT_BUFFER_S = 30;

// ─── Validation patterns ──────────────────────────────────────────────────────

/** Valid environment variable key: starts with letter/underscore, safe chars. */
const SAFE_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_./-]{0,127}$/;

/** Valid tag key: alphanumeric, hyphens, underscores. */
const SAFE_TAG_KEY_RE = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Valid session identifier — mirrors the JSON schema's shared_definitions.session_id.
 * Alphanumeric, hyphens, underscores, 8–64 characters.
 */
const SESSION_ID_RE = /^[a-zA-Z0-9_-]{8,64}$/;

/**
 * Valid human-readable session name (optional label set at create time).
 * Alphanumeric, hyphens, underscores, 1–64 characters.
 */
const SESSION_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

// ─── Error codes ──────────────────────────────────────────────────────────────

const ErrorCode = Object.freeze({
  INVALID_PARAMS:    "INVALID_PARAMS",
  PROCESS_TIMEOUT:   "PROCESS_TIMEOUT",
  SPAWN_FAILED:      "SPAWN_FAILED",
  OUTPUT_OVERFLOW:   "OUTPUT_OVERFLOW",
  EXECUTION_FAILED:  "EXECUTION_FAILED",
  TEMP_FILE_ERROR:   "TEMP_FILE_ERROR",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  PARSE_ERROR:       "PARSE_ERROR",
});

// ─── Common field validators ──────────────────────────────────────────────────

/**
 * Validates fields common to VM-creation tools (run, run_script, session_create).
 * Each tool's validate() calls this and then validates its own unique fields.
 *
 * @param {object}   raw    - Raw params object.
 * @param {string[]} errors - Mutable errors array to push into.
 */
function validateCommonFields(raw, errors) {
  // Numeric range fields
  for (const field of ["cpu", "ram", "timeout"]) {
    if (raw[field] !== undefined) {
      const n = Number(raw[field]);
      const { min, max } = LIMITS[field];
      if (!Number.isInteger(n) || n < min || n > max) {
        errors.push(`${field} must be an integer between ${min} and ${max}`);
      }
    }
  }

  // image
  if (raw.image !== undefined && typeof raw.image !== "string") {
    errors.push("image must be a string");
  }

  // working_dir
  if (raw.working_dir !== undefined) {
    if (typeof raw.working_dir !== "string" || !raw.working_dir.startsWith("/")) {
      errors.push("working_dir must be an absolute path string");
    }
  }

  // idempotency_key
  if (raw.idempotency_key !== undefined && raw.idempotency_key !== null) {
    if (typeof raw.idempotency_key !== "string" || !/^[a-zA-Z0-9_-]{8,128}$/.test(raw.idempotency_key)) {
      errors.push("idempotency_key must be an alphanumeric string between 8 and 128 characters");
    }
  }

  // env_vars
  if (raw.env_vars !== undefined) {
    if (typeof raw.env_vars !== "object" || Array.isArray(raw.env_vars)) {
      errors.push("env_vars must be a plain object");
    } else {
      for (const k of Object.keys(raw.env_vars)) {
        if (!SAFE_KEY_RE.test(k)) {
          errors.push(`env_vars key "${k}" contains invalid characters`);
        }
      }
    }
  }

  // tags
  if (raw.tags !== undefined) {
    if (typeof raw.tags !== "object" || Array.isArray(raw.tags)) {
      errors.push("tags must be a plain object");
    } else {
      for (const k of Object.keys(raw.tags)) {
        if (!SAFE_TAG_KEY_RE.test(k)) {
          errors.push(`tag key "${k}" contains invalid characters`);
        }
      }
    }
  }
}

/**
 * Validate a session_id field.
 * Used by session_exec and session_destroy which target an existing session.
 *
 * @param {object}   raw    - Raw params object.
 * @param {string[]} errors - Mutable errors array to push into.
 */
function validateSessionId(raw, errors) {
  if (typeof raw.session_id !== "string" || !SESSION_ID_RE.test(raw.session_id)) {
    errors.push(
      `session_id must match ${SESSION_ID_RE} (got: ${JSON.stringify(raw.session_id)})`,
    );
  }
}

/**
 * Coerce and apply defaults for fields common to VM-creation tools.
 * Call only after validateCommonFields() confirms no errors.
 *
 * @param {object} raw
 * @returns {object}
 */
function applyCommonDefaults(raw) {
  return {
    cpu:             raw.cpu        !== undefined ? Number(raw.cpu)     : 1,
    ram:             raw.ram        !== undefined ? Number(raw.ram)     : 1024,
    image:           raw.image      !== undefined ? String(raw.image)   : "ubuntu-22.04-base",
    timeout:         raw.timeout    !== undefined ? Number(raw.timeout) : 120,
    env_vars:        raw.env_vars        ?? {},
    working_dir:     raw.working_dir     ?? "/home/user",
    idempotency_key: raw.idempotency_key ?? null,
    tags:            raw.tags            ?? {},
  };
}

/**
 * Coerce and apply defaults for the minimal set of fields accepted by
 * session_exec (which targets an already-running VM — no cpu/ram/image).
 *
 * @param {object} raw
 * @returns {{ working_dir: string, idempotency_key: string|null }}
 */
function applyExecDefaults(raw) {
  return {
    working_dir:     raw.working_dir     ?? "/home/user",
    idempotency_key: raw.idempotency_key ?? null,
  };
}

// ─── Argument builders ────────────────────────────────────────────────────────

/**
 * Append VM-creation flags (cpu, ram, image, timeout, workdir, idempotency
 * key, tags, env vars) to an argv array.
 *
 * Values are always discrete argv entries — never interpolated into a shell
 * string — so there is no injection surface even if values contain spaces.
 *
 * @param {string[]} args - Mutable argv array to append to.
 * @param {object}   p    - Validated + defaulted params (from applyCommonDefaults).
 */
function appendCommonArgs(args, p) {
  args.push(
    "--cpu",     String(p.cpu),
    "--ram",     String(p.ram),
    "--image",   p.image,
    "--timeout", String(p.timeout),
    "--workdir", p.working_dir,
  );

  if (p.idempotency_key) {
    args.push("--idempotency-key", p.idempotency_key);
  }

  for (const [k, v] of Object.entries(p.tags)) {
    args.push("--tag", `${k}=${v}`);
  }

  for (const [k, v] of Object.entries(p.env_vars)) {
    args.push("--env", `${k}=${v}`);
  }
}

/**
 * Append the minimal flags accepted by `--exec-session` mode.
 * Does NOT push --cpu/--ram/--image/--tags/--env — those are session-level
 * settings already baked into the running VM.
 *
 * @param {string[]} args - Mutable argv array to append to.
 * @param {object}   p    - Validated + defaulted params (from applyExecDefaults).
 */
function appendExecSessionArgs(args, p) {
  args.push("--workdir", p.working_dir);

  if (p.idempotency_key) {
    args.push("--idempotency-key", p.idempotency_key);
  }
}

// ─── Output parsing ───────────────────────────────────────────────────────────

/**
 * Attempt to parse a JSON envelope emitted by `microvm-remote-run` on its
 * first stdout line.  Falls back to regex scraping for older binary versions.
 *
 * Used for execution tools (run, run_script, session_exec) whose binary emits:
 *   {"vm_id":"vm-abc","logfile":"/var/log/microvm/vm-abc.log","idempotent_hit":false}
 *
 * @param {string} stdout
 * @param {string} stderr
 * @returns {{ vm_id: string|null, logfile: string|null, idempotent_hit: boolean }}
 */
function parseMeta(stdout, stderr) {
  const firstLine = stdout.split("\n")[0].trim();
  if (firstLine.startsWith("{")) {
    try {
      const meta = JSON.parse(firstLine);
      return {
        vm_id:          meta.vm_id          ?? null,
        logfile:        meta.logfile        ?? null,
        idempotent_hit: meta.idempotent_hit ?? false,
      };
    } catch {
      // Fall through to regex scraping.
    }
  }

  return {
    vm_id:          extractPattern(stdout, stderr, /VM[- ]ID:\s*([a-zA-Z0-9_-]+)/i),
    logfile:        extractPattern(stdout, stderr, /Log(?:file)?:\s*(\/\S+)/i),
    idempotent_hit: stdout.includes("IDEMPOTENT-HIT"),
  };
}

/**
 * Parse the JSON payload that structured binary verbs (session_create,
 * session_destroy) emit as their entire stdout.
 *
 * Tries full stdout first (most verbs emit a single JSON object), then falls
 * back to the first line (in case the binary emits trailing newlines or
 * diagnostic lines after the JSON).
 *
 * @param {string} stdout
 * @returns {{ ok: true, data: object } | { ok: false, raw: string }}
 */
function parseJsonOutput(stdout) {
  for (const candidate of [stdout.trim(), stdout.split("\n")[0].trim()]) {
    if (candidate.startsWith("{")) {
      try {
        return { ok: true, data: JSON.parse(candidate) };
      } catch {
        // Try next candidate.
      }
    }
  }
  return { ok: false, raw: stdout };
}

/**
 * Search stdout then stderr for a regex capture group.
 *
 * @param {string} stdout
 * @param {string} stderr
 * @param {RegExp} re - Must contain exactly one capture group.
 * @returns {string|null}
 */
function extractPattern(stdout, stderr, re) {
  const m = stdout.match(re) ?? stderr.match(re);
  return m ? m[1].trim() : null;
}

// ─── Result builders ──────────────────────────────────────────────────────────

/**
 * Build a successful result envelope matching the schema's `vm_result` shape.
 * Used by: microvm_run, microvm_run_script, microvm_session_exec.
 */
function successResult({ stdout, stderr, exitCode, runtimeSeconds, meta }) {
  return {
    vm_id:           meta.vm_id,
    session_id:      null,
    stdout,
    stderr,
    exit_code:       exitCode,
    runtime_seconds: Math.round(runtimeSeconds * 1000) / 1000,
    logfile:         meta.logfile,
    idempotent_hit:  meta.idempotent_hit,
  };
}

/**
 * Build an error result envelope matching the schema's `error_result` shape.
 *
 * @param {string} code    - One of ErrorCode.
 * @param {string} message - Human-readable description.
 * @param {object} [extra] - Additional fields merged into the envelope.
 */
function errorResult(code, message, extra = {}) {
  return { error: code, message, vm_id: null, ...extra };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Generate a collision-resistant filename token using crypto.randomBytes
 * rather than Math.random(), which is not cryptographically strong.
 *
 * @param {string} [prefix="microvm"]
 * @param {string} [ext=".tmp"]
 * @returns {string}  e.g. "microvm-a3f9c2b1d4e7f0a8.sh"
 */
function randomTmpName(prefix = "microvm", ext = ".tmp") {
  return `${prefix}-${randomBytes(8).toString("hex")}${ext}`;
}

// ─── Core spawn executor ──────────────────────────────────────────────────────

/**
 * Spawn `microvm-remote-run` with the given argv, collect stdout/stderr,
 * enforce a wall-clock watchdog, guard against output overflow, and return a
 * normalised result envelope.
 *
 * This is the single source of truth for all process lifecycle logic in the
 * suite.  Each tool builds its args and calls this — tool-specific result
 * shaping is handled via the `parseSuccess` callback.
 *
 * @param {string[]} args
 * @param {object}   [options]
 * @param {number}   [options.timeout]
 *   Wall-clock seconds before the watchdog kills the process.
 *   Defaults to 120 + PROCESS_TIMEOUT_BUFFER_S.
 *
 * @param {Function} [options.parseSuccess]
 *   Called with `{ stdout, stderr, exitCode, runtimeSeconds, meta }` when the
 *   process exits with a non-null exit code.  Must return the result envelope.
 *   Defaults to `successResult` (vm_result shape).
 *   Tools whose binary emits a different JSON shape (session_create,
 *   session_destroy) supply their own parser here.
 *
 * @param {Function} [options.onSettle]
 *   Optional async cleanup callback invoked with the result envelope before
 *   the Promise resolves.  Used by run_script to delete its temp file.
 *   Errors thrown here are swallowed — they must not suppress the result.
 *
 * @returns {Promise<object>}  Normalised result or error envelope.
 */
async function spawnExecutor(args, { timeout, parseSuccess, onSettle } = {}) {
  // Spawn ─────────────────────────────────────────────────────────────────────
  let proc;
  try {
    proc = spawn(BINARY, args, {
      cwd: CWD,
      // Pass through the host environment so PATH, SSH keys, etc. are
      // available to the binary.  User-supplied env_vars are injected into
      // the VM via --env flags, not into the host process.
      env:   process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    return errorResult(ErrorCode.SPAWN_FAILED, `Failed to spawn ${BINARY}: ${err.message}`);
  }

  const startTime    = process.hrtime.bigint();
  const buildSuccess = typeof parseSuccess === "function" ? parseSuccess : successResult;

  return new Promise((resolve) => {
    let stdout     = "";
    let stderr     = "";
    let totalBytes = 0;
    let overflowed = false;
    let settled    = false;

    /**
     * Resolve exactly once.  Cancels the watchdog, kills the process if still
     * running, then calls onSettle() for tool-specific cleanup before resolving.
     */
    async function settle(result) {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (!proc.killed) proc.kill("SIGKILL");
      if (typeof onSettle === "function") {
        try { await onSettle(result); } catch { /* cleanup errors must not suppress the result */ }
      }
      resolve(result);
    }

    // Watchdog ────────────────────────────────────────────────────────────────
    const effectiveTimeout = timeout ?? 120;
    const watchdogMs       = (effectiveTimeout + PROCESS_TIMEOUT_BUFFER_S) * 1000;
    const watchdog         = setTimeout(() => {
      settle(
        errorResult(
          ErrorCode.PROCESS_TIMEOUT,
          `Process did not exit within ${effectiveTimeout + PROCESS_TIMEOUT_BUFFER_S}s wall-clock limit`,
        ),
      );
    }, watchdogMs);

    // Stream handlers ─────────────────────────────────────────────────────────
    function onData(target, chunk) {
      if (overflowed) return;

      totalBytes += chunk.length;
      if (totalBytes > MAX_OUTPUT_BYTES) {
        overflowed = true;
        settle(
          errorResult(
            ErrorCode.OUTPUT_OVERFLOW,
            `Output exceeded ${MAX_OUTPUT_BYTES / 1024 / 1024} MB limit`,
          ),
        );
        return;
      }

      if (target === "stdout") stdout += chunk.toString("utf8");
      else                     stderr += chunk.toString("utf8");
    }

    proc.stdout.on("data", (chunk) => onData("stdout", chunk));
    proc.stderr.on("data", (chunk) => onData("stderr", chunk));

    // Process exit ─────────────────────────────────────────────────────────────
    proc.on("close", (exitCode, signal) => {
      const runtimeSeconds = Number(process.hrtime.bigint() - startTime) / 1e9;

      // Null exit code → killed by signal; settle was already called by the
      // watchdog or overflow handler.  Guard against a double-settle here.
      if (exitCode === null) {
        settle(
          errorResult(ErrorCode.EXECUTION_FAILED, `Process killed by signal ${signal}`),
        );
        return;
      }

      settle(
        buildSuccess({
          stdout,
          stderr,
          exitCode,
          runtimeSeconds,
          meta: parseMeta(stdout, stderr),
        }),
      );
    });

    // Spawn error ─────────────────────────────────────────────────────────────
    proc.on("error", (err) => {
      settle(
        errorResult(ErrorCode.SPAWN_FAILED, `${BINARY} process error: ${err.message}`),
      );
    });
  });
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  BINARY,
  CWD,
  LIMITS,
  MAX_OUTPUT_BYTES,
  PROCESS_TIMEOUT_BUFFER_S,
  SAFE_KEY_RE,
  SAFE_TAG_KEY_RE,
  SESSION_ID_RE,
  SESSION_NAME_RE,
  ErrorCode,

  // Validation helpers
  validateCommonFields,
  validateSessionId,
  applyCommonDefaults,
  applyExecDefaults,

  // Argument helpers
  appendCommonArgs,
  appendExecSessionArgs,

  // Output parsing
  parseMeta,
  parseJsonOutput,
  extractPattern,

  // Result builders
  successResult,
  errorResult,

  // Utilities
  randomTmpName,

  // Core executor
  spawnExecutor,
};
