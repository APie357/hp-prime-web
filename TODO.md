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
- [x] Screenshot view (`ScreenPanel.svelte`): Screenshot, Live mirror, Save PNG, pixel-format picker (RGB555 / RGB565 / Gray). Not yet tried on hardware
  - [x] On the G2: the default RGB555 shows the screen correctly
  - [ ] Does the live mirror keep up, and do screenshots work while a program is running?
- [ ] Experimental run (M5), built 2026-11-10, untested on hardware:
  - [x] Remote keypad (key codes 0–50, Prime layout, alpha letters), plus typing on the focused screen view
  - [x] **Test keys** probe: Home → screenshot → `1` → screenshot → diff → Del; result remembered in localStorage
  - [x] **▶ Send & Run** (Ctrl+Shift+Enter): send → Home, Esc, name via Alpha (+ `( )` and numeric args when the procedure has parameters) → Enter → live screen
  - [x] On the G2: `EC 01 00 00 00 01 code` reaches the calculator but is only *queued*: the key appears when a physical key is pressed (and the battery icon then disappears)
  - [x] Try the key modes: on the G2 (2026-11-10) all four (single, batch, release, ready) only add to the key buffer without refreshing the screen
  - [x] **Send & Run works on the G2** (the program starts)
  - [ ] Find out why Send & Run takes effect while single keys don't (Enter at the end? the screenshots around it?), so the keypad and Test keys can work too; V2 framing as a last resort
  - [x] On the G2: lower case is Alpha → Shift → key (confirmed)
  - [ ] Is there a key sequence for `_`?
- [x] Delete a program or note on the calculator (`EB`): ✕ in the calculator list, confirmation, then an F8 probe checks it's gone
  - [x] On the G2: EB deletes; the calculator sends no reply (the F8 probe confirms)
- [x] Notes (type `0x05`): list, fetch, edit, send (plain text; rich formatting is replaced on upload)
- [x] Verify notes on the G2: plain-text upload shows correctly in the Notes app, and the formatting warning appears for rich notes
- [ ] Optional: preserve rich formatting when the plain text hasn't changed
- [x] Set the calculator clock (`E7`) — **Sync clock** button
- [x] Verify clock sync on the G2 (correct date and time, timezone)
- [x] Chat (`F2`): send and receive, with a chat log in the Calculator panel
  - [x] On the G2: sent messages appear on the calculator, and its replies arrive as `F2 01 len(u32BE) UTF-16LE text 00 00`
  - [x] Receiving works in the web UI (idle listener); the Help softkey shows as a help request
  - [x] Receiving (messages and Help) also works while the live screen is on (G2, 2026-11-10)
  - [x] Clear the calculator's **Help•** flag: send the same empty chat back (`F2 01 00000002 00 00`, verified on the G2) → **✋ Clear help** button in the Chat section
- [x] Full backup to a `.zip` (`src/lib/files/backup.ts`: `manifest.json`, `raw/<type>/<name>.bin` for every object, readable `programs/` and `notes/`)
- [x] Restore programs and notes from a backup `.zip` (through the verified send path; other object types are skipped)
  - [ ] On the G2: back up, restore, and compare
  - [ ] Restoring apps/variables/settings from `raw/` (needs hardware testing; risky)
- [x] Auto-reconnect to an already-granted calculator on page load and when it's plugged back in
  - [ ] Check in Chrome on hardware
- [ ] V2 negotiated transport (`FF EC …`), only if legacy framing misbehaves on some firmware
- [x] Apps (built 2026-11-10; format verified on a G2 backup, sending untested):
  - [x] Calculator's **Send** key (Apps, Program Catalog, Notes) → prompt → saved to the workspace
  - [x] Apps as `<Name>.hpappdir/` folders: program, Info note, extra files (Python modules) editable; app data and binary files sent as-is
  - [x] List apps (Calculator panel), fetch by name, open into the workspace, delete custom apps (EB type 02)
  - [x] Send an app (overwrite check, read-back verify); ＋ App creates one from a base app's data
  - [x] App icon (`icon.png`, 38×38 like Dynatris's): 🖼 on the app row or in New app; any image is centre-cropped and scaled
  - [ ] On the G2: does an RGBA PNG icon show in the Apps screen? (Dynatris's is a 4-bit palette PNG; convert if needed)
  - [ ] On the G2: does sending an app work? Does a new app (copied bag, new name) appear in the Apps screen? Does F8 fetch one app?
  - [ ] ▶ Run an app (deferred): e.g. send a helper program that calls `STARTAPP("Name")`, then start it like Send & Run

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
Built 2026-11-10; not yet tried in a browser (no headless Chromium on the dev machine):
- [x] Rename files: ✏ (or F2) in the file list, or double-click a tab; the extension, and so the kind, stays
- [x] Tabs for several open files: close with ✕ or middle-click (saves first), drag to reorder, ● for unsaved; cursor/scroll kept per tab; open tabs remembered per workspace
- [x] Diff view (`DiffView.svelte`, Monaco diff editor): when the read-back mismatches, and when importing over a local file that differs (Keep local / Use calculator's version)
- [x] Detect outside changes in an opened folder (on window focus and every 3 s): the file list updates; a clean open file reloads; one with unsaved edits shows a diff (Use disk version / Keep mine); saving never overwrites an outside edit without asking
- [x] Resizable file list, calculator panel and console (drag the edges, arrow keys when focused, double-click to reset); sizes remembered
- [x] Light theme: ◐/☀/☾ button cycles Auto (follows the system) → Light → Dark; Monaco follows; the keypad stays calculator-coloured
- [ ] Try all of the above in Chrome

## 5. Build / infra
- [ ] Shrink the Monaco bundle (currently about 4 MB; `register.all` pulls in every contribution)
- [ ] Bump GitHub Actions versions (Node 20 deprecation warning)
- [ ] Commit the fake-WebHID Playwright smoke test and run it in CI
- [x] Decide on a license (MIT)
