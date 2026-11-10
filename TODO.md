# TODO

Plan, protocol notes and status live in `AGENTS.md`. This is the working task list.

## 1. Real-hardware verification (G2)
The user confirmed on 2026-11-09 that connect, send, receive, list, and fetch work on their G2.

- [x] Connect: device info shows name and firmware, and the ready check returns `Y`
- [ ] Work out whether **pad reports** is needed for sends to work, and record the answer in AGENTS.md
- [x] Send a new program (`WEBTEST`): read-back verifies, it appears in the Program Catalog, and it runs by hand
- [ ] Check that the overwrite prompt appears for an existing name, and that a missing name costs only about 1.5 s
- [x] **List programs** (F9 backup): all programs show up, and the end-of-backup frame is detected (not just the quiet timeout)
- [x] **Fetch** by name round-trips the text exactly (line endings, trailing NUL, non-ASCII characters such as `▶`, `≤`, `π`)
- [x] Large program (>16 KB): does the G2 accept it? Adjust the size warning
- [x] Unplug/replug while connected: the UI recovers cleanly
- [ ] G1 (`0x1541`), if one is available: same checklist with 64-byte reports

## 2. Calculator features
- [ ] Screenshot view (the parser and RGB555 decoder already exist), plus a live-mirror toggle
- [ ] `.hpprgm` import/export (plain and `7C 61 8A B2` container layouts; uploads must stay raw text)
- [ ] Experimental run (M5):
  - [ ] Remote keypad (key codes 0–50)
  - [ ] Key-injection probe: screenshot → Home → screenshot → diff; record the result in AGENTS.md
  - [ ] If keys work: **Send & Run** (Home → type the name with Alpha → Enter) and a live screen view
- [ ] Delete a program on the calculator (`EB`), with confirmation and verification afterwards
- [x] Notes (type `0x05`): list, fetch, edit, send (plain text; rich formatting is replaced on upload)
- [x] Verify notes on the G2: plain-text upload shows correctly in the Notes app, and the formatting warning appears for rich notes
- [ ] Optional: preserve rich formatting when the plain text hasn't changed
- [x] Set the calculator clock (`E7`) — **Sync clock** button
- [x] Verify clock sync on the G2 (correct date and time, timezone)
- [ ] Chat send/receive (`F2`)
- [ ] Full backup to a `.zip`
- [ ] Auto-reconnect to an already-granted calculator on page load
- [ ] V2 negotiated transport (`FF EC …`), only if legacy framing misbehaves on some firmware

## 3. Editor / language support (paused — resume later)
- [x] Command catalog with signatures and docs (`src/lib/lang/catalog.ts`, all 163 commands from hpemu `builtins.rs`; not yet wired into the editor)
- [x] Completion: keywords, builtins, snippets, and the file's own procedures, globals, parameters and locals
- [x] Hover docs and signature help (`src/lib/lang/providers.ts`; not yet checked in a browser)
- [x] Snippets: `EXPORT` procedure, `IF/THEN/ELSE/END`, `FOR`, `WHILE`, `REPEAT`, `CASE`
- [x] Outline, go-to-definition, folding for `BEGIN…END` and other blocks (`src/lib/lang/symbols.ts`; not yet tried in a browser)
- [x] Lint (`src/lib/lang/diagnostics.ts`; not yet tried in a browser): unbalanced blocks and brackets, unterminated strings, missing `;`, `=` vs `:=`, built-in argument counts, assignment to undeclared variables, lower-case commands, duplicate declarations
- [x] Assignment shortcuts: **Alt+=** types `:=`, **Alt+.** types `▶` (editor actions, PPL files only; also in the F1 command palette). Not yet tried in a browser
- [x] Formatter (`src/lib/lang/format.ts`; Shift+Alt+F or right-click → Format Document): re-indents by block, upper-cases keywords, trims trailing whitespace, collapses blank lines; leaves strings, comments, command case and `#cas…#end` alone. Unit-tested, not yet tried in a browser
- [x] Highlight built-in commands (case-sensitive, so lower-case CAS calls and user variables aren't colored as commands); not yet tried in a browser
- [ ] Try all language features in a browser (completion, hover, signature help, outline, go-to-definition, folding, lint markers, formatter, highlighting) — deferred: no room for a headless Chromium on the dev machine

## 4. Workspace / UI
- [ ] Rename files
- [ ] Tabs for several open files
- [ ] Show a diff when the read-back mismatches, or when importing over a local file that differs
- [ ] Detect external changes to files in an opened folder
- [ ] Resizable panels; persist the layout
- [ ] Light theme

## 5. Build / infra
- [ ] Shrink the Monaco bundle (currently about 4 MB; `register.all` pulls in every contribution)
- [ ] Bump GitHub Actions versions (Node 20 deprecation warning)
- [ ] Commit the fake-WebHID Playwright smoke test and run it in CI
- [x] Decide on a license (MIT)
