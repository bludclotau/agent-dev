# What Wendy can do

End to end on this VM when the checks in the tests pass:

- The planner accepts only the five GBNF tool names. A `microvm_session_exec` call is rejected before anything runs.
- `publish_to_site` refuses a slug that is not in `site/allowlist.json`. The PHP endpoint does the same check and will not take a path from the body.
- Publish does not run unless the confirm hook allows it. The default CLI hook allows it only when `WENDY_CONFIRM=yes`.
- If the planner throws, `supervise` starts one fresh attempt.
- `save_to_db` writes a `findings` row for persona `wendy` in `agent_cluster`.
- `find_page` and `read_page` open the URL with `agent-browser` through `microvm-run`, then destroy the session.

Still limited:

- The microvm executor is the repo's session script. It isolates a session id and runs the command with `bash -lc`. It is not a hardware virtual machine.
- BrowserOS is not wired. The reason is in `docs/browser-backend.md`.
- `openclaw/` and `tools/remote_shell.*` are unused. See `UNUSED.md`.
Checked on this VM:

- Seven unit tests pass, including the grammar name set, the publish allowlist, the confirm hook, and the supervisor restart.
- `save_to_db` inserted a `findings` row for `wendy` titled Example Domain.
- `read_page` of `https://example.com` went through `microvm-run` and returned the Example Domain heading.
- `publish.php` wrote `pages/notes.php` for slug `notes` and rejected `../secret`.
- A grammar-constrained completion returned `{"tool": "done", "args": {"text": "pong"}}`.
