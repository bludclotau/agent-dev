# Wendy

One agent, one pipeline: find a page, read it, save the useful part to Postgres, publish to a local PHP page.

The model is constrained with the same llama.cpp GBNF shape used by gguf-router. It can emit `find_page`, `read_page`, `save_to_db`, `publish_to_site`, or `done`. It cannot name `microvm_*`, a shell, or a filesystem path.

`find_page` and `read_page` run `agent-browser` inside a microvm session (`microvm/microvm-run`). BrowserOS was not used. It is an AGPL desktop Chromium app, and its CLI only talks to a running BrowserOS window. This VM has no display. agent-browser already reads pages headless, so that is the backend. See `docs/browser-backend.md`.

`publish_to_site` posts a slug. `site/publish.php` maps that slug through `site/allowlist.json` and writes only the named file under `site/pages/`. A publish does not run unless the confirm hook returns true.

`save_to_db` inserts into `findings` on the existing `agent_cluster` database.

```bash
cd agent
npm install
node --test tests/wendy.test.js
DATABASE_URL=... PUBLISH_TOKEN=... node agent.js "Read https://example.com and stop."
```

What is still limited is written in `docs/status.md`.
