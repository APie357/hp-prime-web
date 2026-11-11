# Third-party references

This project's code is written from scratch. Protocol knowledge and some data
tables come from the following projects:

| Project | License | Used for |
|---|---|---|
| [debrouxl/hplp](https://github.com/debrouxl/hplp) (libhpcalcs) | GPL-2.0+ | Protocol reference only (framing, command IDs, F7/F8 layout, CRC). No code copied. |
| [56phil/prime_connection_kit](https://github.com/56phil/prime_connection_kit) | MIT | G2 hardware findings: 1024-byte reports, `Y` ready reply, silent F7, raw UTF-16 program payload, info-string heuristic. |
| [golba98/hp-prime-emulator](https://github.com/golba98/hp-prime-emulator) | MIT | F8 NUL-terminated names, EB delete layout + fixture, RGB555LE screenshot samples, PPL builtin command names/arities (seed for `src/lib/lang/catalog.ts`). |
| [BeatSkip/PrimeDev](https://github.com/BeatSkip/PrimeDev) | MIT | Key code table 0–50 (`HpKey.cs`), V2 negotiated framing notes. |
| [microsoft/monaco-editor](https://github.com/microsoft/monaco-editor) | MIT | Code editor. |

## Bundled runtime dependencies (shipped in the built site)

| Package | License |
|---|---|
| monaco-editor (incl. marked, dompurify) | MIT (marked: MIT; dompurify: MPL-2.0 OR Apache-2.0, used under Apache-2.0) |
| svelte | MIT |
| fflate | MIT |
| idb-keyval | Apache-2.0 |

## Trademarks
- The Python logo mark in `src/components/PythonLogo.svelte` is taken unaltered (paths and colors, without the wordmark) from python.org's `python-logo-generic.svg`. "Python" and the Python logos are trademarks of the Python Software Foundation, used here only to label Python files, per the [PSF Trademark Usage Policy](https://www.python.org/psf/trademarks/).
