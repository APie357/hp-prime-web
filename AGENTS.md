# HP Prime Web IDE — Plan

## Context
The goal is a browser IDE for writing HP Prime PPL ("HP Basic") programs and sending them to a real calculator over **WebHID**, with syntax highlighting and IntelliSense. More features (backup, notes, remote keypad, …) come later. Per the user, **the plan lives in this file (`AGENTS.md`)**. Keep it updated as milestones land.

**User decisions:** the target hardware is the **HP Prime G2** (USB `03F0:2441`). The stack is **Vite + TypeScript + Svelte 5 + Monaco**. Storage is a **local folder (File System Access API) with IndexedDB fallback**. "Run" is a reliable **Send**, plus an **opt-in experimental Send & Run** that uses key injection, with a screenshot check.

## Status (keep current)
- **Done:** M1 scaffold. M2 protocol core plus unit tests (`npm test`). M4 core: send the program with an overwrite check and read-back verify, list calculator programs (F9 backup), fetch by name (F8), open into the workspace. The editor is Monaco with *minimal* PPL highlighting. The workspace is a folder (FS Access) or browser storage, with autosave. The console has a hex packet log, a pad-reports toggle, and raw send.
- **Language features (paused 2026-11-09, catalog added 2026-11-10):** `src/lib/lang/catalog.ts` holds all 163 commands with signatures, docs, arities and aliases, plus lookup helpers and hover Markdown (docs are from the User Guide, not hardware-checked). `src/lib/lang/providers.ts` now registers completion (commands, keywords, snippets), hover and signature help with Monaco (type-checked and unit-tested for the helpers, not yet tried in a browser). `src/lib/lang/symbols.ts` scans procedures, parameters, `LOCAL`/loop variables and file-level variables, which feed user-symbol completion, hover, signature help, the outline, go-to-definition (case-sensitive, scope-aware) and block folding; unit-tested, not yet tried in a browser. `src/lib/lang/diagnostics.ts` lints (errors for structure and argument counts, warnings for likely typos and undeclared assignments, a hint for lower-case commands) and publishes Monaco markers 300 ms after edits; argument counting is skipped when a `#pragma` sets separators. Not yet tried in a browser. `src/lib/lang/format.ts` is a conservative formatter (re-indent, upper-case keywords, trim whitespace; strings, comments, command case and `#cas` blocks untouched), registered as Monaco's document formatter with a minimal-diff edit; unit-tested. Alt+= types `:=` and Alt+. types `▶` (actions in `Editor.svelte`). The Monarch tokenizer (`src/lib/monaco.ts`) is case-sensitive: keywords in UPPER/lower/Title case, catalog commands as `predefined` only when upper case. Browser checks are deferred, because the dev machine has no room for a headless Chromium; test by hand. `src/lib/lang/lexer.ts` is ready for the analyzer when this resumes; the seed data is hpemu `crates/ppl-compiler/src/builtins.rs` (163 builtins with arities).
- **Verified on the user's G2 (2026-11-09/10):** connect, send (with read-back), receive, list (F9), fetch (F8), large programs (>16 KB), notes (plain-text upload and the formatting warning) and clock sync all work with legacy framing. Unplug/replug while connected recovers cleanly. Not yet checked: whether `pad reports` matters, the overwrite prompt and missing-name timing, a G1. See TODO.md §1.
- **Notes + clock sync (2026-11-09):** notes are `.note` files (plain text) and send, fetch and list like programs, using type `0x05`. **Sync clock** sends E7 followed by a ready check. Both confirmed on the G2.
- **Bundle (2026-11-10):** Monaco loads lazily (`Editor.svelte` imports `src/lib/monaco.ts` on mount, `DiffView.svelte` when the dialog opens), so the entry chunk stays small and Monaco is a separate ~3.5 MB chunk. Never import `src/lib/monaco.ts` statically from a component (use `import type` for types). `src/lib/monaco-features.ts` lists the editor contributions used, instead of `features/register.all`; add one there when a feature needs it (e.g. rename). CI uses Node 26. On this dev machine the native Rolldown binary dies with "Illegal instruction"; run build/test/check with `NAPI_RS_FORCE_WASI=true` after `npm i --no-save @rolldown/binding-wasm32-wasi@<rolldown version>`.
- **UI:** the console is hidden by default and toggled from the status bar or with Ctrl+` (remembered in localStorage). **2026-11-10 (not yet tried in a browser):** editor tabs (`app.openFiles`, remembered per workspace), file rename (`Workspace.rename`), a Monaco diff dialog (`showDiff` → `DiffView.svelte`) for read-back mismatches, imports over a different local file and outside-change conflicts, outside-change detection for folder workspaces (`Workspace.stat` + `checkExternalChanges`), resizable panels (`Splitter.svelte`, sizes in `src/lib/ui.svelte.ts`), and a light theme (CSS variables in `app.css`, `prime-light` Monaco theme, Auto/Light/Dark). The Files header has one **New** button (`NewFileDialog.svelte`: Program/Note/App, and a typed extension such as `.note` or `.hpapp` picks the type via `parseNewName`; App hands the name to `NewAppDialog`). The toolbar's gear opens `SettingsDialog.svelte`: theme (Auto/Light/Dark), screen pixel format, and on/off flags in `ui` (`setFlag`): **List contents on connect** (on; runs after the connect step's busy lock), **Chat** (off), **Advanced → Fetch by name** (off), **Experimental → Remote keys** (off: Keypad, Test keys/key mode, typing on the screen) and **Experimental → .hpprgm files** (off) and **Experimental → Backup and restore** (off, untested on hardware). The Calculator header has icon buttons for List contents (↻) and Sync clock. The Files header is one row: the workspace name as the title, then Open folder, Use browser storage (hidden when already in use), New and Refresh. UI icons are Material Symbols Rounded SVGs (`Icon.svelte`; add a name to the glob and `IconName` in `src/lib/icons.ts` before using it), not emoji or Unicode glyphs.
- **Screen + run (2026-11-10):** `ScreenPanel.svelte` shows screenshots (single, live mirror, save PNG); the pixel format is in Settings. **The screen displays correctly on the G2 with the default RGB555.** Key injection only queues keys on the G2 (see Remote run); a key-mode picker next to Test keys selects the encoding. `Keypad.svelte` is a remote keypad, and typing on the focused screen also sends keys (`keysForKeyboardEvent`). The key table and the text→keys mapping are in `src/lib/hid/keys.ts`: upper case is Alpha+key, lower case is Alpha+Shift+key (confirmed on the G2), and `_` can't be typed. `PrimeSession.pressKeys` sends **one `EC` message per key** with an 80 ms gap. PrimeDev only defines the codes (`HpKey.cs`; `SENDKEY = 0xEC`); no reference builds the message, so the layout is unconfirmed. **Test keys** (`probeKeys`) runs the probe and remembers the result. **▶ Send & Run** sends, then types Home, Esc, the name (`runTarget`: the exported procedure named like the file, else the first exported one; numeric args go inside `( )`), Enter, and turns on the live screen. It warns when the screen didn't change.
- **More calculator features (2026-11-10, untested on hardware):** **Delete** (✕ per object in the Calculator panel) sends `EB`, treats an F9 reply as a refusal, and confirms with an F8 probe. **Backup to .zip** (`src/lib/files/backup.ts`) stores every F9 object raw plus readable programs/notes and a `manifest.json`. **Restore…** sends only the programs and notes from such a zip through `sendText` (with read-back). **Chat** (verified on the G2): `F2` sends a message, and the calculator's replies come in unprompted as `F2 01 len(u32BE) text(UTF-16LE) 00 00` (any text or equation). The Messages app's **Help** softkey sends an empty message (`len 2`, body `00 00`), identical on every press, and the UI shows it as a help request. It only sets the Help• flag; **sending the same empty chat back (`F2 01 00 00 00 02 00 00`) clears it** (verified on the G2), which is what the ✋ Clear help button does. Receiving works in the web UI, including while the live screen mirror is running (G2, 2026-11-10). Bytes after `len` are stale buffer contents, so ignore them. `PrimeSession.listen()` reads the link while idle to catch them (it yields to operations through `ReportPort.cancelRead`), and `recvMessage` also passes along a chat that arrives ahead of a reply. **Delete is verified on the G2: `EB` gets no reply.** The app **auto-reconnects** to a granted calculator on load and on the HID `connect` event.
- **Apps (2026-11-10):** `src/lib/files/app.ts` parses and builds the type-02 body. It is a series of u32BE-length sections: bag (`.hpapp`, byte 20 = base app), Info note, program (UTF-16LE + NUL), then extra files (name UTF-16 + `00 00` + data). It round-trips every app in the user's G2 backup. The workspace stores apps as `<Name>.hpappdir/` (`Workspace` handles one level of subfolders and binary files; `src/lib/files/kinds.ts` decides type and encoding per path). The calculator's Send key pushes unsolicited `F7`s; `PrimeSession.onObject` gets them and state asks before saving. Sending apps, creating apps and F8 for apps are **untested on hardware**. Running apps is deferred.
- **Exam-mode configurations (2026-11-11, receiving verified on the G2; sending untested):** behind **Settings → Calculator → Exam mode configurations** (off). Type `0B` objects from the F9 listing appear in the Calculator panel (open, delete; `Default Exam` can't be deleted). They save as top-level `<Name>.hpexammode` files (raw bytes, the Connectivity Kit's extension) and open in `ExamEditor.svelte` (a form, not Monaco). Send = `sendExamFile` (overwrite check, `sendObject` + read-back); the stored name is set to the file name first. The calculator's Send key pushes them too. The format (`src/lib/files/exam.ts`, `docs/formats/exam-mode.md`) was mapped from 12 single-change configurations made on the G2 (2026-11-11): name, timeout, option flags (memory, angle, LED/security code), CAS (0x040 bit 7) and a linear CRC-32 at 0x41C that `updateChecksum` keeps exact on every edit (it reproduces the calculator's values). The password hash (0x440, 64 B) depends only on the password and can't be computed, only copied from another configuration. Other disabled features are raw bits until mapped (`EXAM_FEATURES`). Open: whether the CRC covers the name; sending configurations to the calculator; renamed configurations not showing up (TODO §2). Setting a password needs the hash algorithm (probably keyed; TODO §2).
- **Python app scripts (2026-11-11, untested on hardware):** the scripts made in the calculator's built-in Python app (`&Python`) are assumed to be that app's extra files (the Files menu shows names like `main.py`). The Calculator panel lists them under **Python scripts** (Open → `&Python.hpappdir/<file>`, Delete). **Send** on a script in a built-in app's folder (`sendAppScript`) fetches the live app with F8 (falling back, after asking, to the last listing's copy, since F8 for apps is unconfirmed), replaces or adds just that file, and sends the app back with a read-back. Everything else in the app goes back as it was. Import can put a `.py` straight into the Python app.
- **Import / `.hpprgm` (2026-11-11, not yet tried in a browser):** the Files header's Import button (`importFiles`) copies files into the workspace: `.hpppl`/`.ppl`/`.txt` programs (UTF-8 or UTF-16, `decodeTextFile`), `.hpapp`/`.hpappprgm`/`.hpappnote` into `<name>.hpappdir/`, `.py` into an app picked in a choice dialog (`askChoice`) or a new None-based Python app, and `.hpexammode` (exam setting on). **`.hpprgm` is behind Settings → Experimental → .hpprgm files (off):** import (G2/G1 → `<name>.hpppl`) and a program row's export button (G2). Layout from Insoft's Xprime (`src/lib/files/hpprgm.ts`, `docs/formats/hpprgm.md`), untested with real Connectivity Kit files.
- **Next:** hardware checks (backup/restore, auto-reconnect); why Send & Run works while single keys don't (TODO §1, plus screen colors and `EC` on the G2) → language-feature browser check.

## Conventions
- Repo: https://github.com/APie357/hp-prime-web (public). Every push to `main` runs `.github/workflows/pages.yml` (test → build → deploy) to https://apie357.github.io/hp-prime-web/. Vite's `base` is `/hp-prime-web/` in production builds.
- Protocol code in `src/lib/hid/` stays framework-free and unit-tested. The UI talks to it only through `src/lib/state.svelte.ts`.
- `PrimeSession` serializes all operations. Never touch the port outside it.
- Program uploads are raw UTF-16LE text with no BOM, `\n` line endings, and no `.hpprgm` container.
- A headless smoke test with a fake `navigator.hid` G2 was used during development (not committed). Re-create one when changing the UI flow.
- No native `prompt()`/`alert()`/`confirm()`: use `askText`/`showAlert`/`askConfirm` from `src/lib/dialogs.svelte.ts` (queued modals rendered by `Dialogs.svelte`).
- Commit messages end with the Co-Authored-By line given by the harness.

## Protocol findings (from hplp + modern reverse-engineering)
The full write-up, marked by how sure each fact is, is **`docs/PROTOCOL.md`**; each object type's body format has its own file in **`docs/formats/`** (program, note, app, exam-mode, plus `.hpprgm` files). Keep them in step with any new finding. The notes below are the working summary.

Sources: `debrouxl/hplp` (`libhpcalcs/src/prime_vpkt.c`, `prime_cmd.c`, `hplibs.h`); `56phil/prime_connection_kit` (MIT; **verified on a G2, firmware V2.060.650**); `golba98/hp-prime-emulator` (MIT; G1 2.2.15157 docs); `BeatSkip/PrimeDev` (a Blazor WebHID app for the G2, with the V2 framing).

- **USB IDs:** VID `0x03F0`; PIDs `0x0441` (old G1), `0x1541` (G1 ≥ fw 8151), `0x2441` (G2). Vendor HID, unnumbered reports (report ID 0).
- **Report size:** 64 bytes on the G1, **1024 on the G2**. Always read it from `HIDDevice.collections[].outputReports/inputReports` (reportSize × reportCount / 8), never hard-code it. Payload capacity = report size − 1.
- **Legacy framing (works on the G2 per pck):** each report is `[seq][payload…]` (sent with `sendReport(0, …)`). seq starts at 0, increments, and wraps 0xFE→0x00, skipping 0xFF. A short report ends the message. Inbound reports with seq `0xFF` are out-of-band and get skipped. A reply's length comes from the header `cmd, 0x01, len u32 BE` (+6). `0xFF` (ready) replies with a single byte, `0x59` 'Y'.
- **Commands:** `FF` ready, `FA` info, `FC` screenshot `[FC, fmt]` (reply `FC 01 len CRC16BE fmt FF FF FF FF PNG…`; fmt 0x08 = 320×240 with 16-bit PNG samples), `F9` backup (a stream of F7 files, ending with an F9 frame), `F8` request file, `F7` file, `EC` keys `EC 01 count(u32BE) codes…`, `F2` chat (UTF-16LE), `E7` set time, `EB` delete object (the CK-derived format: `EB 01 len type namelen crc name`).
- **F7/F8 layout:** `cmd 01 len(u32BE) type namelen crcLo crcHi name(UTF-16LE) [content]`. CRC-16/CCITT (XModem table from `prime_cmd.c`) runs over `message.length − 6` bytes, with bytes 8–9 zeroed. Type `0x06` is a program. **F8 names need a UTF-16 NUL terminator** (otherwise the calculator stays silent); a missing object gives no reply, so it times out.
- **Program payload = raw UTF-16LE source text, with no BOM and no `.hpprgm` container.** Sending the container truncates the program at the first NUL, which has destroyed programs in the past. The G2 sends **no ACK to F7**, so treat a short timeout as success and an `F9` reply as a refusal.
- **V2 negotiated protocol (G2, build ≥ 10591):** to switch, send `[FF EC 00 00 00 00 00 00]`. The first frame is then `[01][msgId u32LE][size u32LE][≤1015 B]`, continuations are `[seq 2..FD][≤1023 B]`, and ACK/NACK frames are `[FE ack seqToResend 00 pos u32LE msgId u32LE]`. Files may be zlib-compressed (0x78 at offset 10). **This is deferred.** I'll put the framing behind an interface so V2 can be added if legacy framing turns out to fail on the user's firmware.
- **Remote run:** there is no USB "run program" command. `EC` key injection had **no visible effect on a G1 at 2.2.15157**. **On the user's G2 (2026-11-10)** a single-key `EC 01 00 00 00 01 code` (the same layout as hplp's `calc_prime_s_send_key`; hplp's multi-key form is `EC 01 count(u32BE) codes…`) is *queued but not processed*: the character appears only when a physical key is pressed, just before that key's own character. After that, the status-bar battery icon disappears. Screenshots (fmt 0x08, RGB555 decode) display correctly. `PrimeSession.pressKeys` has experimental modes (`single`, `batch`, `release` = code then code|0x80, `ready` = follow with a ready check) to find a sequence that wakes the UI. Key codes 0–50 come from `PrimeDev/PrimeWeb/HpTypes/HpKey.cs` (Apps=0 … Esc=4, Home=5, Enter=30, Alpha=36, Shift=41, Plus=50). **All four key modes only queue keys on the G2, yet Send & Run does start the program** (user, 2026-11-10); the reason is unknown. So run is **experimental only**.
- **Notes (type 0x05):** UTF-16LE plain text terminated by NUL, optionally followed by a rich-text section (`CSWD110` or `CSWT110`, `FF FF FF FF`, then backslash control words; per pck). We upload plain UTF-16LE text, which hpemu verified round-trips on hardware. Uploading over a formatted note replaces its formatting, and the overwrite prompt says so.
- **Clock (E7):** `E7 01 len 00 00 54 1E YY MM DD hh mm ss`, where YY is the year − 2000, in local time. There is no reply, so we follow it with a ready check.
- **Program size:** G1 legacy uploads above about 15,928 B were dropped. The limit is unknown on the G2, so show a warning rather than a hard block.

## Architecture / file layout
```
AGENTS.md                      plan + protocol notes + conventions (kept current)
TODO.md                        task list: hardware checks, features, bugs
docs/PROTOCOL.md               HP Prime G2 USB protocol reference (verified vs reference vs unknown)
docs/formats/                  object body formats: program.md, note.md, app.md, exam-mode.md; hpprgm.md (CK files)
package.json, vite.config.ts, tsconfig*.json, svelte.config.js
udev/60-hp-prime.rules         hidraw access on Linux (TAG+="uaccess" for 03f0:0441/1541/2441)
THIRD_PARTY.md                 attribution (hplp GPL ref-only, pck/hpemu MIT, PrimeDev keycodes)
src/
  main.ts, App.svelte          toolbar (Connect | Send | Send & Run | settings) and layout:
                               file list | editor | right panel (screen + calculator); bottom console; status bar
  lib/state.svelte.ts          app state and every action the UI calls (the only way into the protocol layer)
  lib/ui.svelte.ts             UI preferences in localStorage: theme, setting flags, panel sizes
  lib/dialogs.svelte.ts        askText/askConfirm/askChoice/showAlert (queued modals; no native prompt/alert/confirm)
  lib/hid/
    port.ts        ReportPort interface (WebHID or test mocks)
    transport.ts   WebHID wrapper: requestDevice filters, report size from the descriptor, input queue
                   with read(timeoutMs), drain(), connect/disconnect events, optional report padding
    framing.ts     pure legacy fragment()/Reassembler (capacity param); `LinkFraming` interface
    crc16.ts       CRC-16/XMODEM
    bytes.ts       UTF-16LE and other byte helpers
    commands.ts    builders: ready, info, screenshot, requestFile, sendFile, backup, keys, chat, time, delete;
                   ObjType table
    parsers.ts     info, file messages (incl. zlib), screenshot
    session.ts     PrimeSession: serialized op queue; sendText/readText, sendApp/sendObject (+ read-back),
                   backup, deleteObject, screenshot, pressKeys, chat, setDateTime, idle listener
    keys.ts        key codes 0–50 + alpha letters, text→key sequences, run sequence
    log.ts         Svelte store of hex-dumped IN/OUT packets for the console
  lib/screen.ts      screenshot decode (Prime 16-bit PNG or browser) + pixel diff for the key probe
  lib/icons.ts       bundled Material Symbols (build-time glob of the used names) + file-type → icon
  lib/monaco.ts      Monaco bootstrap (loaded lazily): PPL Monarch tokenizer, themes, Python, providers
  lib/monaco-features.ts  the editor contributions used (instead of register.all)
  lib/files/
    kinds.ts       per-path file type, editor language and text encoding (pure)
    workspace.ts   FS Access folder (handle persisted in IndexedDB) + IndexedDB fallback; rename falls
                   back to copy-then-delete when move() is refused
    note.ts        note (type 05) codec: plain text + rich-text section
    app.ts         app (type 02) body codec + .hpappdir layout, base apps, new-app starters
    icon.ts        app icon.png (38×38, center-cropped)
    hpprgm.ts      Connectivity Kit .hpprgm read (G2/G1) and write (G2); file-only, never sent
    exam.ts        exam-mode configuration (type 0B) codec: name, timeout, options, CAS, CRC-32, password copy
    backup.ts      full-backup .zip (manifest + raw objects + readable programs/notes) build/read
  lib/lang/
    catalog.ts     PPL command table {name, signatures[], doc, category}; names/arity from hpemu builtins.rs
    lexer.ts       forgiving PPL lexer for the analyzer
    symbols.ts     procedures, LOCAL/global vars, params → outline, go-to-definition, completions
    format.ts      formatter: block re-indent, keyword case, whitespace (strings/comments/#cas verbatim)
    diagnostics.ts structural lint → Monaco markers
    providers.ts   Monaco PPL providers: completion, hover, signature help, symbols, definition, folding, format
    python.ts, pythonModules.ts, pythonProviders.ts  HP Prime Python completion/hover/signatures
                   (.py files and #PYTHON blocks)
  components/
    FileList.svelte       workspace files and app folders; open/rename/delete, app actions
    Editor.svelte         tabs + Monaco (one model per file); exam configurations open ExamEditor instead
    ExamEditor.svelte     exam configuration form: timeout, options, password copy, features, compare, raw bits
    CalcPanel.svelte      calculator: info, list contents, clock, apps/programs/notes/exam configs, chat,
                          fetch by name, backup/restore
    ScreenPanel.svelte    screenshot, live mirror, save PNG, Test keys, keypad toggle
    Keypad.svelte         remote keypad (key codes 0–50)
    Console.svelte        status log + hex packet log + raw send box
    DiffView.svelte       modal Monaco diff with action buttons (showDiff in state)
    NewFileDialog.svelte  New: program / note / app
    NewAppDialog.svelte   new app: base app, PPL or Python, icon
    SettingsDialog.svelte theme, pixel format, feature flags
    Dialogs.svelte        renders the queued dialogs
    Icon.svelte, PythonLogo.svelte, Splitter.svelte
tests/               vitest: protocol (crc16, framing, commands, parsers), session (mock transport), app, note,
                     exam, backup, kinds, workspace, keys, icons, PPL language (catalog, symbols, diagnostics,
                     format, providers) and Python
```

## Milestones
1. **Scaffold + AGENTS.md:** `git init`. Write AGENTS.md (this plan, the protocol notes, conventions). Set up Vite+Svelte+TS, Monaco (ESM with Vite workers), vitest, the udev rule, and a banner shown when the browser lacks WebHID (Chromium desktop only; needs a secure context, and localhost counts).
2. **Protocol core:** crc16, framing, commands, parsers, session with a mock transport, and unit tests against byte fixtures (e.g. the EB `ZZT_TEST` fixture `EB 01 00 00 00 14 06 10 66 C9 …` validates CRC + layout; hplp F7 layout; reassembly with seq wrap and 0xFF skip). Then the WebHID transport plus the Device panel: connect, info, ready, screenshot. A packet log is included.
3. **Editor + language:** Monaco with the PPL language (tokenizer, theme, completion, hover, signature help, snippets, outline, go-to-def, folding, diagnostics). Workspace storage: open a folder (FS Access) or use the browser store. Autosave and tabs.
4. **Send / pull programs:** Send converts the editor text to UTF-16LE (no BOM). The name comes from the file name, validated against the Prime identifier rules. Before overwriting, an F8 probe checks whether the name exists and asks for confirmation. After sending, the program is read back with F8 and compared byte-for-byte to verify it arrived; the result shows in the status bar. Pull: a calculator program list via backup (F9), and opening any program in the editor. `.hpprgm` import/export.
5. **Experimental run:** a remote keypad, plus a probe that takes a screenshot, sends Home (5), screenshots again, and diffs the images to report whether key injection works on this G2. If it works, Send & Run becomes Home → type `NAME` via the Alpha key map → Enter, followed by a live screen poll. If it fails, show a clear "start it from the Program Catalog" message with live screen mirroring.
6. **Later (logged in AGENTS.md backlog):** V2 negotiated transport, notes, delete (EB), chat, set clock, backup to a zip, a PPL formatter, and an offline interpreter/emulator.

## Verification
- `npm run test`: vitest unit tests for CRC, framing round-trips (64 and 1024 capacities), command byte fixtures, parsers, `.hpprgm` decode/encode, the symbol scanner and the linter.
- `npm run build && npm run preview`; open in Chrome. Check the editor: highlighting, completion, hover and signature help on e.g. `TEXTOUT_P(`, outline, and a diagnostic for a missing `END`.
- Hardware (G2 on Linux; install `udev/60-hp-prime.rules`, then `sudo udevadm control --reload && sudo udevadm trigger`):
  1. Connect → device info shows the model and firmware, and ready returns `Y`.
  2. Screenshot → a correct-color 320×240 image.
  3. Send a new test program `WEBTEST` (one that cannot overwrite anything) → the read-back matches, it appears in the Program Catalog, and running it by hand works.
  4. Pull `WEBTEST` back into the editor → the text is identical.
  5. Key probe → record whether `EC` works on the G2 in AGENTS.md.
- The packet log stays available throughout for diagnosing a mismatch (e.g. sendReport padding, or needing V2).

## Risks / open items
- G2 firmware variance. If legacy framing fails, implement V2 using the PrimeDev reference.
- WebHID `sendReport` length behavior (padded vs short final report). A pad toggle is in the transport; record which one works.
- Linux hidraw permissions are needed before Chrome can open the device.
- hplp is GPL. Use it only as a protocol reference; write all code fresh. pck and hpemu are MIT; attribute any adapted tables.
