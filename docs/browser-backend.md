# Browser backend

Wendy's find and read steps call `agent-browser` from inside a microvm session. The model does not choose the binary or the shell command.

BrowserOS (`browseros-ai/BrowserOS`, AGPL-3.0) was the other candidate. Its CLI is a client of a running BrowserOS MCP server. BrowserOS itself is a Chromium desktop app. The project describes it as not a headless driver, and the current neo build is macOS and Windows. On this VM `DISPLAY` is unset. Using BrowserOS would mean installing the full browser, starting it under Xvfb, and keeping that process up so `browseros-cli` has something to talk to. The license also means the code stays an external program, not a vendored library.

agent-browser already runs headless here and returns a page read without a display. That is the lower overhead, and it fits the session sandbox: Wendy asks to find or read, the pipeline builds one quoted URL, and the microvm executor runs that command. BrowserOS is not installed and is not called.
