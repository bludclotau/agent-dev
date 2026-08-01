#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");

// Import your microvm tools
const microvm_session_create  = require("../tools/microvm_session_create.cjs");
const microvm_session_exec    = require("../tools/microvm_session_exec.cjs");
const microvm_file_write      = require("../tools/microvm_file_write.cjs");
const microvm_file_read       = require("../tools/microvm_file_read.cjs");
const microvm_session_destroy = require("../tools/microvm_session_destroy.cjs");

// ─────────────────────────────────────────────────────────────────────────────
// 1. Helper: Run Ollama (Gemma) to generate Python code
// ─────────────────────────────────────────────────────────────────────────────

function generatePythonFromGemma(prompt) {
  return new Promise((resolve, reject) => {
    const proc = spawn("ollama", ["run", "gemma:2b"], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let out = "";
    proc.stdout.on("data", d => out += d.toString());
    proc.stderr.on("data", d => process.stderr.write("ollama: " + d.toString()));

    proc.on("close", code => {
      if (code !== 0) return reject(new Error("Ollama exited with code " + code));
      resolve(out.trim());
    });

    proc.stdin.write(prompt);
    proc.stdin.end();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Main workflow
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n=== Generating Python particle simulator with Gemma ===\n");

  const pythonCode = await generatePythonFromGemma(`
Write a Python particle simulator with 200 particles bouncing in a 2D box.
Use numpy for vectorized updates. Print the particle positions every 10 frames.
No external dependencies except numpy. Keep it simple and runnable.
  `);

  console.log("Generated Python code:\n");
  console.log(pythonCode);
  console.log("\n──────────────────────────────────────────────\n");

  // ─────────────────────────────────────────────
  // Create VM session
  // ─────────────────────────────────────────────
  console.log("=== Creating VM session ===\n");

  const create = await microvm_session_create({
    session_name: "particle-sim",
    cpu: 2,
    ram: 2048,
    image: "ubuntu-22.04-base",
    idle_ttl_seconds: 600
  });

  if (create.error) {
    console.error("Session create failed:", create);
    process.exit(1);
  }

  const session_id = create.session_id;
  console.log("Session created:", session_id, "\n");

  // ─────────────────────────────────────────────
  // Write Python code into VM
  // ─────────────────────────────────────────────
  console.log("=== Writing particle_sim.py into VM ===\n");

  const write = await microvm_file_write({
    session_id,
    path: "/home/user/particle_sim.py",
    content: pythonCode,
    encoding: "utf-8",
    mode: "0755"
  });

  if (write.error) {
    console.error("File write failed:", write);
    process.exit(1);
  }

  console.log("File written successfully.\n");

  // ─────────────────────────────────────────────
  // Execute Python code inside VM
  // ─────────────────────────────────────────────
  console.log("=== Running particle simulator ===\n");

  const execResult = await microvm_session_exec({
    session_id,
    command: "python3 /home/user/particle_sim.py",
    exec_timeout: 120
  });

  if (execResult.error) {
    console.error("Execution failed:", execResult);
  } else {
    console.log("Program output:\n");
    console.log(execResult.stdout);
  }

  console.log("\n──────────────────────────────────────────────\n");

  // ─────────────────────────────────────────────
  // Destroy session
  // ─────────────────────────────────────────────
  console.log("=== Destroying session ===\n");

  const destroy = await microvm_session_destroy({ session_id });

  if (destroy.error) {
    console.error("Destroy failed:", destroy);
  } else {
    console.log("Session destroyed:", destroy.session_id);
  }

  console.log("\n=== Done ===\n");
}

// Run main()
main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
