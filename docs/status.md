# What Wendy can do

End to end on this VM when the checks in the tests pass:

- The planner accepts only the five GBNF tool names. A `microvm_session_exec` call is rejected before anything runs.
- `publish_to_site` refuses a slug that is not in `site/allowlist.json`. The PHP endpoint does the same check and will not take a path from the body.
- Publish does not run inside the planner. It is written to `pending_approvals` and waits for Keyhole.
- If the planner throws, `supervise` starts one fresh attempt.
- `save_to_db` writes a `findings` row for persona `wendy` in `agent_cluster`.
- `find_page` and `read_page` open the URL with `agent-browser` through `microvm-run`, then destroy the session.

Still limited:

- The microvm executor is the repo's session script. It isolates a session id and runs the command with `bash -lc`. It is not a hardware virtual machine.
- BrowserOS is not wired. The reason is in `docs/browser-backend.md`.
- `openclaw/` and `tools/remote_shell.*` are unused. See `UNUSED.md`.
## Fragment library

`prompt_fragments` holds the sentences that used to be hardcoded in `agent/llm.js`. Coarse rows tagged `core` are always included. A fine row is included when one of its tags is a word in the goal. If no fine row matches, every fine row is included so a vague goal still has the full pipeline. The allowed-tool line, the goal, and the previous-step trace are still assembled in code. The GBNF `toolname` line is generated from the tools on the selected fragments. `done` is always allowed.

## Show and tell

Keyhole's Wendy tab reads `GET /api/wendy/pending`. Each card shows the proposed slug, title, and body, plus the find/read steps stored on the row. Approve posts to the existing `publish.php` allowlist. Reject only marks the row. The env var `WENDY_CONFIRM` is no longer the gate.

Checked on this VM:

- Seven unit tests pass, including the grammar name set, the publish allowlist, the confirm hook, and the supervisor restart.
- `save_to_db` inserted a `findings` row for `wendy` titled Example Domain.
- `read_page` of `https://example.com` went through `microvm-run` and returned the Example Domain heading.
- `publish.php` wrote `pages/notes.php` for slug `notes` and rejected `../secret`.
- A grammar-constrained completion returned `{"tool": "done", "args": {"text": "pong"}}`.

This pass, on the same VM:

- Six seeded fragments are in `prompt_fragments`. A goal that only says "read" selects `find_page`, `read_page`, and `done`. A goal that names find, read, save, and publish selects all five.
- A publish proposal became pending approval 1 and showed up through Keyhole at `/api/wendy/pending`. Approve wrote `pages/notes.php`. A call with no token returned 401.
