#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/opt/snerloc/agent";
const TOOLS_DIR = path.join(ROOT, "tools");
const LIB_DIR = path.join(TOOLS_DIR, "lib");

const REQUIRED_FILES = [
  "microvm_session_create.cjs",
  "microvm_session_exec.cjs",
  "microvm_session_destroy.cjs",
  "microvm_file_write.cjs",
  "microvm_file_read.cjs",
];

const REQUIRED_LIB_FILES = [
  "shared.cjs",
];

function exists(p) {
  return fs.existsSync(p);
}

function header(title) {
  console.log("\n──────────────────────────────────────────────");
  console.log(" " + title);
  console.log("──────────────────────────────────────────────");
}

function checkDirectoryStructure() {
  header("Checking directory structure");

  console.log("TOOLS_DIR:", TOOLS_DIR);
  console.log("LIB_DIR:  ", LIB_DIR);

  if (!exists(TOOLS_DIR)) {
    console.log("❌ tools/ directory is missing");
    return false;
  } else {
    console.log("✔ tools/ directory exists");
  }

  if (!exists(LIB_DIR)) {
    console.log("❌ tools/lib/ directory is missing");
    return false;
  } else {
    console.log("✔ tools/lib/ directory exists");
  }

  return true;
}

function checkToolFiles() {
  header("Checking tool files");

  let ok = true;

  for (const file of REQUIRED_FILES) {
    const full = path.join(TOOLS_DIR, file);
    if (exists(full)) {
      console.log("✔ " + file);
    } else {
      console.log("❌ " + file + " (missing)");
      ok = false;
    }
  }

  return ok;
}

function checkLibFiles() {
  header("Checking shared library");

  let ok = true;

  for (const file of REQUIRED_LIB_FILES) {
    const full = path.join(LIB_DIR, file);
    if (exists(full)) {
      console.log("✔ " + file);
    } else {
      console.log("❌ " + file + " (missing)");
      ok = false;
    }
  }

  return ok;
}

function testRequire() {
  header("Testing require() imports");

  let ok = true;

  for (const file of REQUIRED_FILES) {
    const full = path.join(TOOLS_DIR, file);
    try {
      require(full);
      console.log("✔ require() OK:", file);
    } catch (err) {
      console.log("❌ require() FAILED:", file);
      console.log("   →", err.message);
      ok = false;
    }
  }

  // Test shared.cjs
  const sharedPath = path.join(LIB_DIR, "shared.cjs");
  try {
    require(sharedPath);
    console.log("✔ require() OK: shared.cjs");
  } catch (err) {
    console.log("❌ require() FAILED: shared.cjs");
    console.log("   →", err.message);
    ok = false;
  }

  return ok;
}

function main() {
  console.log("\n=== SNERLOC DIAGNOSTIC TOOL ===\n");

  const dirOK = checkDirectoryStructure();
  const toolsOK = checkToolFiles();
  const libOK = checkLibFiles();
  const requireOK = testRequire();

  header("SUMMARY");

  if (dirOK && toolsOK && libOK && requireOK) {
    console.log("🎉 ALL CHECKS PASSED — your toolchain is correctly installed.");
  } else {
    console.log("⚠ Some checks failed — fix the above issues and re-run this tool.");
  }

  console.log("\nDone.\n");
}

main();
