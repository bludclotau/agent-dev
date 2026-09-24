// UNUSED by Wendy. The model does not call this server. See ../UNUSED.md.
import express from "express";
import bodyParser from "body-parser";
import { tools } from "./tools/index.js";

const app = express();
app.use(bodyParser.json());

app.post("/tool", async (req, res) => {
  const { tool, arguments: args } = req.body;

  if (!tools[tool]) {
    return res.status(400).json({ error: "Unknown tool" });
  }

  try {
    const result = await tools[tool](args || {});
    res.json({ ok: true, result });
  } catch (err) {
    res.json({ ok: false, error: err });
  }
});

app.listen(3928, () => {
  console.log("OpenClaw running on port 3928");
});
