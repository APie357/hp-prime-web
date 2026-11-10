# HP Prime Web IDE — Plan

## Context
The goal is a browser IDE for writing HP Prime PPL ("HP Basic") programs and sending them to a real calculator over **WebHID**, with syntax highlighting and IntelliSense. More features (backup, notes, remote keypad, …) come later. Per the user, **the plan lives in this file (`AGENTS.md`)**. Keep it updated as milestones land.

**User decisions:** the target hardware is the **HP Prime G2** (USB `03F0:2441`). The stack is **Vite + TypeScript + Svelte 5 + Monaco**. Storage is a **local folder (File System Access API) with IndexedDB fallback**. "Run" is a reliable **Send**, plus an **opt-in experimental Send & Run** that uses key injection, with a screenshot check.

## Status (keep current)
- **Done:** M1 scaffold. M2 protocol core plus unit tests (`npm test`). M4 core: send the program with an overwrite check and read-back verify, list calculator programs (F9 backup), fetch by name (F8), open into the workspace. The editor is Monaco with *minimal* PPL highlighting. The workspace is a folder (FS Access) or browser storage, with autosave. The console has a hex packet log, a pad-reports toggle, and raw send.
- **Paused by the user (2026-11-09):** rich language features (catalog, completion, hover, signature help, outline, lint). Only a minimal Monarch tokenizer exists (`src/lib/monaco.ts`). `src/lib/lang/lexer.ts` is ready for the analyzer when this resumes; the seed data is hpemu `crates/ppl-compiler/src/builtins.rs` (163 builtins with arities).
- **Not yet verified on real hardware.** The first G2 run must confirm the Verification steps below and record the results here. That includes whether `pad reports` is needed.
- **Next:** hardware verification → screenshot view → `.hpprgm` import/export → experimental run (M5) → language features (M3 rest).

## Conventions
- Protocol code in `src/lib/hid/` stays framework-free and unit-tested. The UI talks to it only through `src/lib/state.svelte.ts`.
- `PrimeSession` serializes all operations. Never touch the port outside it.
- Program uploads are raw UTF-16LE text with no BOM, `\n` line endings, and no `.hpprgm` container.
- A headless smoke test with a fake `navigator.hid` G2 was used during development (not committed). Re-create one when changing the UI flow.
- Commit messages end with the Co-Authored-By line given by the harness.

## Protocol findings (from hplp + modern reverse-engineering)
Sources: `debrouxl/hplp` (`libhpcalcs/src/prime_vpkt.c`, `prime_cmd.c`, `hplibs.h`); `56phil/prime_connection_kit` (MIT; **verified on a G2, firmware V2.060.650**); `golba98/hp-prime-emulator` (MIT; G1 2.2.15157 docs); `BeatSkip/PrimeDev` (a Blazor WebHID app for the G2, with the V2 framing).

- **USB IDs:** VID `0x03F0`; PIDs `0x0441` (old G1), `0x1541` (G1 ≥ fw 8151), `0x2441` (G2). Vendor HID, unnumbered reports (report ID 0).
- **Report size:** 64 bytes on the G1, **1024 on the G2**. Always read it from `HIDDevice.collections[].outputReports/inputReports` (reportSize × reportCount / 8), never hard-code it. Payload capacity = report size − 1.
- **Legacy framing (works on the G2 per pck):** each report is `[seq][payload…]` (sent with `sendReport(0, …)`). seq starts at 0, increments, and wraps 0xFE→0x00, skipping 0xFF. A short report ends the message. Inbound reports with seq `0xFF` are out-of-band and get skipped. A reply's length comes from the header `cmd, 0x01, len u32 BE` (+6). `0xFF` (ready) replies with a single byte, `0x59` 'Y'.
- **Commands:** `FF` ready, `FA` info, `FC` screenshot `[FC, fmt]` (reply `FC 01 len CRC16BE fmt FF FF FF FF PNG…`; fmt 0x08 = 320×240 with 16-bit PNG samples), `F9` backup (a stream of F7 files, ending with an F9 frame), `F8` request file, `F7` file, `EC` keys `EC 01 count(u32BE) codes…`, `F2` chat (UTF-16LE), `E7` set time, `EB` delete object (the CK-derived format: `EB 01 len type namelen crc name`).
- **F7/F8 layout:** `cmd 01 len(u32BE) type namelen crcLo crcHi name(UTF-16LE) [content]`. CRC-16/CCITT (XModem table from `prime_cmd.c`) runs over `message.length − 6` bytes, with bytes 8–9 zeroed. Type `0x06` is a program. **F8 names need a UTF-16 NUL terminator** (otherwise the calculator stays silent); a missing object gives no reply, so it times out.
- **Program payload = raw UTF-16LE source text, with no BOM and no `.hpprgm` container.** Sending the container truncates the program at the first NUL, which has destroyed programs in the past. The G2 sends **no ACK to F7**, so treat a short timeout as success and an `F9` reply as a refusal.
- **V2 negotiated protocol (G2, build ≥ 10591):** to switch, send `[FF EC 00 00 00 00 00 00]`. The first frame is then `[01][msgId u32LE][size u32LE][≤1015 B]`, continuations are `[seq 2..FD][≤1023 B]`, and ACK/NACK frames are `[FE ack seqToResend 00 pos u32LE msgId u32LE]`. Files may be zlib-compressed (0x78 at offset 10). **This is deferred.** I'll put the framing behind an interface so V2 can be added if legacy framing turns out to fail on the user's firmware.
- **Remote run:** there is no USB "run program" command. `EC` key injection had **no visible effect on a G1 at 2.2.15157**, and it is untested on the G2. Key codes 0–50 come from `PrimeDev/PrimeWeb/HpTypes/HpKey.cs` (Apps=0 … Esc=4, Home=5, Enter=30, Alpha=36, Shift=41, Plus=50). So run is **experimental only**.
- **Program size:** G1 legacy uploads above about 15,928 B were dropped. The limit is unknown on the G2, so show a warning rather than a hard block.

## Architecture / file layout
```
AGENTS.md                      plan + protocol notes + conventions (kept current)
package.json, vite.config.ts, tsconfig.json, svelte.config.js
udev/60-hp-prime.rules         hidraw access on Linux (TAG+="uaccess" for 03f0:0441/1541/2441)
THIRD_PARTY.md                 attribution (hplp GPL ref-only, pck/hpemu MIT, PrimeDev keycodes)
src/
  main.ts, App.svelte          layout: file tree | editor | right panel (device/screen); bottom console
  lib/hid/
    transport.ts   WebHID wrapper: requestDevice filters, open/close, report size from descriptor,
                   inputreport → async queue with read(timeoutMs), drain(), connect/disconnect events,
                   optional pad-to-report-size setting
    framing.ts     pure legacy fragment()/Reassembler (capacity param); `LinkFraming` interface
    crc16.ts       CCITT table CRC
    commands.ts    builders: ready, info, screenshot, requestFile, sendFile, backup, keys, chat, time, delete
    parsers.ts     info (name/version/build/serial), file reply, screenshot → PNG → RGB565→RGBA canvas
    session.ts     PrimeSession: serialized op queue (mutex), perform(msg, expectReply, timeout),
                   sendProgram(), readProgram(), backup(), screenshot(), sendKeys()
    log.ts         Svelte store of hex-dumped IN/OUT packets for the console
  lib/files/
    hpprgm.ts      decode (plain + 7C618AB2 container) / encode plain .hpprgm; UTF-16 helpers
    workspace.ts   FS Access dir handle (persisted in IndexedDB, re-permission on load) + IndexedDB fallback
  lib/lang/
    ppl.monarch.ts Monarch tokenizer: keywords (case-insensitive BEGIN/END/IF/THEN/ELSE/FOR/FROM/TO/STEP/
                   DO/WHILE/REPEAT/UNTIL/CASE/DEFAULT/RETURN/BREAK/CONTINUE/LOCAL/EXPORT/KILL/IFERR…),
                   ▶ and := assignment, //comments, strings, numbers incl. #hex/#bin, builtins
    catalog.ts     command table {name, signatures[], doc, category}; names/arity seeded from
                   hpemu crates/ppl-compiler/src/builtins.rs (MIT); docs written per HP Prime User Guide
    symbols.ts     lightweight scanner: EXPORT/procedure defs, LOCAL/global vars, params → outline,
                   go-to-definition, user-symbol completions
    providers.ts   Monaco completion (keywords, builtins, snippets for IF/FOR/WHILE/procedure),
                   hover, signature help, document symbols, definition, folding (BEGIN…END)
    diagnostics.ts structural lint: unbalanced BEGIN/END & block terminators, missing `;`, `=` vs `:=`,
                   undeclared-ish identifiers (warning) → Monaco markers
  components/
    Toolbar.svelte     Connect | Send | Send & Run (experimental, behind a toggle) | Screenshot
    FileTree.svelte    workspace files; new/rename/delete; import/export .hpprgm/.txt
    Editor.svelte      Monaco instance (vite worker import), one model per open file, tabs
    DevicePanel.svelte device info, calculator program list (from backup), pull program into editor
    ScreenView.svelte  screenshot view; live-poll toggle
    Keypad.svelte      remote keypad (keycodes 0–50) for the experimental key-injection probe
    Console.svelte     status log + raw hex packet log + raw "send bytes" box (debug aid)
tests/               vitest: crc16, framing, commands, parsers, hpprgm, symbols/diagnostics, session (mock transport)
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
