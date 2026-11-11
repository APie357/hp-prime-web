# Notes (object type `05`)

How a note is stored in a calculator object.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/note.ts`.

**Verified (G2)** for plain text. The layout comes from pck.

```
[plain text, UTF-16LE] [00 00] [optional rich-text section]
```

- The rich-text section starts with the UTF-16 magic `CSWD110` (or `CSWT110` for an app's Info note), then `FF FF FF FF`, then backslash control words for bold, colors and so on. **Reference (pck).**
- Uploading only the plain text works, and the calculator shows it correctly, but it **removes any existing formatting** from that note.
- Note names are freer than program names: spaces are allowed.
- The Connectivity Kit sometimes writes 2-byte placeholder notes with junk content. Treat a body under 4 bytes as empty.
