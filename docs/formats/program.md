# Programs (object type `06`)

How a PPL program is stored in a calculator object.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/hid/session.ts`.

**Verified (G2).** The body is the program's **source text in UTF-16LE**, with no BOM and no container, and `\n` line endings.

- What the host sends is exactly the text. What the calculator sends back has a **UTF-16 NUL (`00 00`) added at the end**: a 146-byte upload came back as 148 bytes. Strip trailing NULs when decoding.
- **Never upload the `.hpprgm` file format.** It contains NUL bytes, and the calculator cuts the program off at the first one. This has destroyed programs before.
- Non-ASCII characters (`▶`, `≤`, `π`, …) survive the round trip.
