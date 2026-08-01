// /opt/snerloc/agent/tools.js
import path from "path";
import { fileURLToPath } from "url";

// Resolve directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load all micro‑VM tools (CommonJS)
const microvm_session_create  = require(path.join(__dirname, "tools/microvm_session_create.cjs"));
const microvm_session_exec    = require(path.join(__dirname, "tools/microvm_session_exec.cjs"));
const microvm_file_write      = require(path.join(__dirname, "tools/microvm_file_write.cjs"));
const microvm_file_read       = require(path.join(__dirname, "tools/microvm_file_read.cjs"));
const microvm_session_destroy = require(path.join(__dirname, "tools/microvm_session_destroy.cjs"));

// Tool dispatcher
export async function executeTool(toolCall) {
  const { command, ...args } = toolCall;

  switch (command) {
    case "microvm_session_create":
      return await microvm_session_create(args);

    case "microvm_session_exec":
      return await microvm_session_exec(args);

    case "microvm_file_write":
      return await microvm_file_write(args);

    case "microvm_file_read":
      return await microvm_file_read(args);

    case "microvm_session_destroy":
      return await microvm_session_destroy(args);

    default:
      return {
        error: "UNKNOWN_TOOL",
        message: `Unknown tool: ${command}`
      };
  }
}
