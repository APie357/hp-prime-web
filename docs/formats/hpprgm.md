# `.hpprgm` program files

The HP Connectivity Kit's file format for a program. It's a **file format only**: the calculator itself takes the raw UTF-16LE source (see [program.md](program.md)). **Never send this container to the calculator.** Its NUL bytes make the calculator cut the program short.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/hpprgm.ts`. **Reference:** the layout follows Insoft's [Xprime](https://github.com/Insoft-UK/Xprime) (`Xcode/Tools/hpppl+/src/libhpprgm/src/hpprgm.cpp` and `hpprgmG1.md`/`hpprgmG2.md`, MIT), with the G1 notes on the [TI-Planet wiki](https://wiki.tiplanet.org/HP_Prime/File_Format). None of it has been checked here against a file saved by the Connectivity Kit.

All numbers are little-endian. Text is UTF-16LE, ending in a NUL (`00 00`).

## G2 (current Connectivity Kit)

```
7C 61 8A B2                  magic (the same one starts an app's data, see app.md)
FE FF FF FF 00 00 00 00      preamble
[procedures record]
[source record]
[trailer]                    optional; 1008 bytes in Connectivity Kit files (per Xprime). Not written here
```

Every record starts with a `u32` length that counts the bytes after it.

**Procedures record**, one entry per procedure in the program:

```
u32 88·n + 4
3E 02 00 01
n × { u32 84, u32 68, 0B 02, u16 64, name (UTF-16LE, 64 bytes, NUL-padded),
      u32 8, 05 02, 80 00, u16 9 if EXPORTed else 8, u16 0 }
```

**Source record:**

```
u32 P + 100
BE 00 40 01
u32 P + 92
u32 68, 8B 00 40 00, "Main" (UTF-16LE, 64 bytes, NUL-padded)
u32 8,  85 00 80 00, u32 (2 for a CAS program, else 0)
u32 P + 4, 9B 00 C0 00, source text (P bytes, including its NUL)
```

A program with large data can carry a **compiled block** (the calculator's internal form) before the source. To read a file, this project takes the source after the first `9B 00 C0 00` tag, using the length in front of it.

The file holds **no program name**: the Connectivity Kit uses the file name.

## G1 (older Connectivity Kit)

```
u32 header size              0x0C, or 14 + name bytes when named
00 00 00 00
u8 named (0 or 1), 7 × 00
if named: 31 00, name (UTF-16LE + NUL)
u32 source size
source text (UTF-16LE + NUL)
```

## In this project

Behind **Settings → Experimental → .hpprgm files** (off by default).

- **Import** (the Files panel's Import button) reads G2 or G1 files and saves each as `<name>.hpppl`. The name is the file's name, or the name inside a named G1 file. An invalid name is asked for. If the workspace already has a different version, a diff lets you choose which to keep.
- **Export** (the export button on a program) writes the G2 format with one procedure entry per procedure the symbol scanner finds (`EXPORT` → 9). The CAS flag is always 0.
