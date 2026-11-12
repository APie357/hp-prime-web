# Built-in help in the firmware image

How the calculator's Help pages are stored in a firmware image (`HPPrime_OS.img`, inside HP's firmware `.zip`).

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/lang/firmwareHelp.ts` (decoder), `src/lib/helpStore.svelte.ts` (loading and storage).

**Decoded from G2 firmware 2.4.2 (2026-09-09)** by reverse engineering: all 2351 English topics decode, and every topic's bits end exactly at its stated length. Not checked against other firmware versions or G1 images. The help text belongs to HP, so the site never bundles it. Users load their own firmware file, and the decoded topics stay in that browser's IndexedDB.

## Help blocks

The image holds one help block per language. A block starts with a header (all values little-endian; offsets are relative to the header's start):

| Offset | Size | Meaning |
|---|---|---|
| `00` | 4 | magic `7C 61 8A B2` (the same bytes as the `.hpprgm` container magic) |
| `0C` | 4 | language: 1 English, 2 Chinese, 3 French, 4 German, 5 Spanish, 6 Dutch, 7 Portuguese, 8 Japanese, 9 Russian |
| `1C` | 4 | topic count (2351; Russian has 1974) |
| `20` | 4 | index offset |
| `24` | 4 | index size |
| `28` | 4 | Huffman tree offset |
| `2C` | 4 | tree size (tree offset + tree size = index offset) |
| `30` | 4 | text offset (index offset + index size) |
| `34` | 4 | text size |
| `38` | 16 | another table (41 English entries of 12 bytes, then data); unknown, probably images |
| `48` | 3 × 64 | localized labels as UTF-16, NUL-padded: "Syntax", "Example", "Examples" |

The decoder finds blocks by the magic plus these offsets agreeing with each other.

## Index

`count` records, one after another:

```
[id u32] [text offset u32] [text length u16] [flags u8] [title length u8] [title UTF-16LE] [00 00]
```

- `id` runs 1…count in English. Topic order is the help tree's order. The Python module reference starts at the topic titled `Python modules`, and Python topics are named like `split (builtins.str)`.
- Flags: `0x02` = has a subtitle, `0x04` = has a body, `0x08` = has examples. The other bits (`0x01`, `0x10` set on most commands, `0x20`, `0x80`) are unknown.
- Translated blocks leave many titles empty (command names aren't translated). Take the English title of the same `id`.

## Text

Each topic's data, at `text offset` from the text block:

```
[u16, meaning unknown] [subtitle] [body] [examples]
```

The u16 isn't a string count. Each string that is present (per the flags, in that order) is Huffman-coded UTF-16 code units, ended by the code for `0x0000`, then padded to a whole byte. Bits are read **least-significant bit first**.

Huffman tree nodes, starting at the root:

| Type byte | Data | Meaning |
|---|---|---|
| `00` | u16 = byte size of the 0-subtree | 0-subtree follows, then the 1-subtree |
| `01` | u16 symbol | 1-branch is that leaf; the 0-subtree follows |
| `02` | u16 symbol | 0-branch is that leaf; the 1-subtree follows |
| `03` | u16, u16 | both branches are leaves (0-branch, 1-branch) |

## Markup

| Markup | Meaning |
|---|---|
| `✎c … c✐` | styled span: `*` bold, `_` heading, `x` and `/` italic, `#` argument name, `^` syntax block, `P` code, `Y` Python code, `;` preformatted, `%` examples section |
| `✎^✎*Syntax:*✐` … `^✐` | the syntax block, one form per line (`[…]` optional, `…` repeats) |
| `✎+` / `✎o` | bullet / sub-bullet; `+✐` ends the list |
| `✍[OK]✍` | a menu key; `✍-▲ Page ▼-✍` is the viewer's scroll control |
| `(--E2--)` | the second line of the examples string |
| `__$Demo_NAME` (in examples) | a link to a demo program on the calculator |
| `U+E003` | the imaginary unit *i*; `U+E004` is ⁻¹; `U+E000`/`U+E001` appear to be x̄ and p̂ |
| `\|V\|`, `\|D\|` | version and date, filled in by the About page |
