// Public tool surface for Wendy. The microvm_* modules stay on disk as the
// sandbox implementation. They are not tools the model can name.
import { executeWendyTool } from "./pipeline.js";

export const WENDY_TOOLS = ["find_page", "read_page", "save_to_db", "publish_to_site", "done"];

export async function executeTool(toolCall, deps) {
  const tool = toolCall.tool || toolCall.command;
  if (!WENDY_TOOLS.includes(tool)) {
    return { ok: false, error: `unused tool refused: ${tool}` };
  }
  return executeWendyTool({ tool, args: toolCall.args || toolCall }, deps);
}
