# Unused by Wendy

These files stay in the tree because other branches and the microvm executor still import them. Wendy's model cannot call them. `agent/tools.js` refuses any name outside `find_page`, `read_page`, `save_to_db`, `publish_to_site`, and `done`.

The session executor under `microvm/microvm-run` and `agent/tools/microvm_*.cjs` is still the sandbox `find_page` and `read_page` run inside. That is internal. It is not a model tool.

Not part of Wendy's pipeline:

- `tools/remote_shell.js`
- `tools/remote_shell.sh`
- `tools/remote_shell.json`
- `openclaw/`
- `agent/tests/run_particle_sim.js`
- `agent/tests/diagnose_tools.cjs`
- the top-level `tools/microvm_*.js` wrappers (the `.cjs` copies under `agent/tools/` are the ones the sandbox uses)
