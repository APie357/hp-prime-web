# Exam-mode configurations (object type `0B`, `.hpexammode`)

How an exam-mode configuration is stored. Everything but the password hash and most of the disabled-feature bits is decoded.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/exam.ts`.

Samples (all **1156 bytes**, same layout, so a type-`0B` object body is the `.hpexammode` file):

- The IB Diploma Programme configuration from hpcalc.org (a 2017 Connectivity Kit file).
- 12 configurations made on the user's G2 on 2026-11-11. **Custom Mode 1** is: CAS disabled (only CAS), 15 min, no angle change, blank password, memory Hide, Blink LED with security code. Each of the others changes one thing: password `1234`; 30 min; Degrees / Radians / Gradians; memory Erase / Keep / Keep and restore; Blink LED without security code; no Blink LED and no security code; CAS enabled.

## Layout

| Offset | Size | Content | Status |
|---|---|---|---|
| 0x000 | 64 | Name, UTF-16LE, NUL-padded | **Verified (G2)** |
| 0x040 | 988 | Disabled-feature bits. **0x040 bit 7 = CAS.** `E1: 38` is set in every G2 sample (meaning unknown). The IB sample sets `40: 86 06 00 00 00 02 00 00 00 00 00 80 01`, `5B: D0 81 3F 1C E0 00 01 00 C0`, `CC: 50` for its 15 disabled items | CAS **verified (G2)**, rest unknown |
| 0x41C | 4 | Checksum (below) | **Verified (G2)** |
| 0x420 | 4 | `FB 74 29 C7` in every G2 sample | Unknown |
| 0x424 | 8 | zero | |
| 0x42C | 16 | `D4 1D 8C D9 8F 00 B2 04 E9 80 09 98 EC F8 42 7E` (the MD5 of the empty string) in every G2 sample | Unknown |
| 0x43C | 4 | `60 7A E9 DB` in every G2 sample | Unknown |
| 0x440 | 64 | Password hash (below) | Partly known |
| 0x480 | 2 | Timeout in minutes, u16 LE | **Verified (G2)** |
| 0x482 | 2 | Option flags, u16 LE (below) | **Verified (G2)** |

The IB sample has zeros from 0x41C to 0x47F: no checksum and no password hash.

### Option flags (0x482, u16 LE)

Custom Mode 1 is `0x01C1`.

| Bits | Setting | Values |
|---|---|---|
| 0, 8 | Memory | Keep = neither, Erase = bit 0, Keep and restore = bit 8, Hide = both. So bit 0 = cleared during the exam, bit 8 = restored afterwards |
| 2–3 | Angle | 0 = no change, 1 = Radians, 2 = Degrees, 3 = Gradians |
| 1, 5, 6 | LED | Off = none; Blink LED = bits 1 and 5; Blink LED with security code = bit 6 only |
| 7 | ? | Set in every G2 sample, not in the IB sample |

The IB sample's `0x0007` reads as Erase, Radians, and bit 1 alone (its Blink LED, from before bit 5 existed). Not seen yet: security code without Blink LED (the calculator may not allow it).

### Checksum (0x41C, u32 LE)

A CRC-32 (reflected polynomial `0x04C11DB7`) over the whole file with the checksum field zeroed. It is **not** the standard init/xorout (`zlib.crc32` doesn't match), but it's linear: for any two configurations of the same length,

```
crc(new) = crc(old) XOR rawcrc(old XOR new)
```

where `rawcrc` is the CRC register with init 0 and no final XOR, run to the end of the file. This reproduces the calculator's value for all 11 single-change samples. Equivalently, `crc = rawcrc(file) XOR 0x364FB76B` if the CRC starts at byte 0, or `rawcrc(file[0x40:]) XOR 0x9A78CBA3` if it starts after the name. Every sample has the same name, so which one is right is still open. A sample with a different name would settle it. Until then, renaming assumes the name is covered.

### Password hash (0x440, 64 bytes)

Depends only on the password: it's identical in every blank-password sample, whatever the other settings, and differs for `1234`. It isn't plain MD5/SHA-1/SHA-2/SHA-3/BLAKE2, HMAC or PBKDF2 (1–10000 rounds) of the password (ASCII or UTF-16), alone or salted with the nearby bytes. So a password can't be set from scratch, but it can be copied from another configuration (and the checksum updated).

HP's guides list the options as: name, read-only, timeout (8 h max on the calculator), default angle (or none), password (1–10 characters), memory (keep and restore / erase / hide), Blink LED, and a tree of features to disable: System Apps (each app and its functions), saved apps, physics constants, Help, Units, Matrices, complex numbers, CAS, connectivity (I/O), Notes and Programs, New Notes and Programs, and the Math menu down to single commands. Only CAS is mapped among the disabled features so far.

**Mapping more features.** Copy a configuration on the calculator, disable one feature, bring both over, and compare them in the exam configuration form (Compare). Record each finding here and in `EXAM_FEATURES`.
