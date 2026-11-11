# Apps (object type `02`)

How an app (its settings, Info note, program and files) is stored in a calculator object, and how this project lays it out in the workspace.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/app.ts`.

**Verified (G2)** for reading: all 19 apps in a G2 backup (the 18 built-ins plus a custom Python app) parse and rebuild byte for byte with this layout. Sending apps hasn't been tried on hardware yet.

The body is a series of sections, each `u32 big-endian length | bytes`:

| # | Section | Contents |
|---|---|---|
| 0 | App data (the Connectivity Kit's `.hpapp`) | A tagged-object "variable bag": `7C 61 8A B2 FF FF FF FF …`, then little-endian records `u32 len \| u32 type \| payload`. **Byte 20 = base app** (table below). It does **not** contain the app's name. |
| 1 | Info note | Like a [note](note.md): UTF-16LE + NUL; `00 00` when empty |
| 2 | App program | UTF-16LE + NUL. The built-in Function and Triangle Solver apps carry a 36-byte binary stub here instead (it contains `Main`). |
| 3… | Extra files | File name (UTF-16LE) + `00 00` + the file's bytes, e.g. `dynatris.py` (plain UTF-8 Python, CRLF), `icon.png`, other data files |

- **Names:** built-in apps are named with a leading `&` (`&Function`, `&Statistics 1Var`). Custom apps have plain names (`Dynatris`).
- **Base app (bag byte 20)**, per prime_connection_kit: 0 Function, 1 Solve, 2 Statistics 1Var, 3 Statistics 2Var, 4 Inference, 5 Parametric, 6 Polar, 7 Sequence, 8 Finance, 9 Linear Solver, 10 Triangle Solver, 14 Data Streamer, 15 Geometry, 16 Spreadsheet, 17 Advanced Graphing, 18 Graph 3D, 19 Explorer, 20 None, 21 Python. Matches all 18 built-ins on the G2.
- **Python apps:** the app program holds `#PYTHON name()` … `#END` blocks (e.g. `START()`, `RESET()`). Modules travel as extra files in plain text. A compressed-looking `.bin` file inside Dynatris is that app's own format: its `.py` decompresses it. It isn't something the calculator does.
- **Icon:** an extra file named `icon.png`. Dynatris's is a 38×38, 4-bit palette PNG. Whether other sizes or PNG kinds work is untested.
- **No separate `07`/`08` objects** appeared in a G2 backup: the note and program travel inside the type-02 body. (hplp marks `07`/`08` as tentative; pck sends them separately.)
- **New apps:** since the bag has no name, a new app is a base app's bag sent under a new name with its own program. **Unverified:** whether the calculator accepts an app created this way.
- **Fetching one app** with `F8` type `02` is untested. Listing works through the backup (§7 in the protocol reference).

## In the workspace

An app is a folder, `<Name>.hpappdir/` (`src/lib/files/kinds.ts`, `src/lib/files/workspace.ts`):

- `<Name>.hpapp`: the app data section, raw.
- `<Name>.hpappnote` and `<Name>.hpappprgm`: the Info note and program in their wire form (UTF-16LE + NUL).
- Every other file is an extra file: `.py` and other text files as UTF-8, anything else as raw bytes.
