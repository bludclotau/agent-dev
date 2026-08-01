// /opt/snerloc/agent/agent.js
import readline from "readline";
import { askLLM } from "./llm.js";
import { executeTool } from "./tools.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function main() {
  let messages = [];

  while (true) {
    const userInput = await new Promise(resolve =>
      rl.question(">>> ", resolve)
    );

    messages.push({ role: "user", content: userInput });

    let llmResponse = await askLLM(messages);

    // Strip markdown fences
    let cleaned = llmResponse
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    let toolCall = null;

    try {
      toolCall = JSON.parse(cleaned);
    } catch {
      console.log(llmResponse);
      messages.push({ role: "assistant", content: llmResponse });
      continue;
    }

    if (toolCall.command) {
      console.log(`Executing tool: ${toolCall.command}`);

      const result = await executeTool(toolCall);
      const resultText = JSON.stringify(result, null, 2);

      messages.push({ role: "assistant", content: resultText });
      console.log(resultText);
    } else {
      console.log(llmResponse);
      messages.push({ role: "assistant", content: llmResponse });
    }
  }
}

main();
