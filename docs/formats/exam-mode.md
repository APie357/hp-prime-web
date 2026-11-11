# Exam-mode configurations (object type `0B`, `.hpexammode`)

How an exam-mode configuration is stored. The name and timeout are known; most of the rest is not.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/exam.ts`.

Samples: the IB Diploma Programme configuration from hpcalc.org (a 2017 Connectivity Kit file), and two configurations read from the user's G2 on 2026-11-11 ("Custom Mode 1" and "Custom Mode 2"). All three are **1156 bytes** with the same layout, so a type-`0B` object body is the `.hpexammode` file.

| Setting | Custom Mode 1 | Custom Mode 2 | IB sample |
|---|---|---|---|
| Timeout | 15 min | 15 min | 2 h (per the bytes) |
| Angle | no change | no change | ? |
| Password | blank | `1234` | ? |
| Memory | hide | hide | erase (IB requires it) |
| Blink LED | yes | yes | yes (IB requires it) |
| Security code | yes | yes | (option didn't exist yet) |
| Disabled features | ? | ? | 15 items (IB list) |

| Offset | Size | Content | Status |
|---|---|---|---|
| 0x000 | 64 | Name, UTF-16LE, NUL-padded | **Verified (G2)** |
| 0x040 | 988 | Options and disabled-feature bits. Custom Modes: `40: 80`, `E1: 38`. IB: `40: 86 06 00 00 00 02 00 00 00 00 00 80 01`, `5B: D0 81 3F 1C E0 00 01 00 C0`, `CC: 50` | Unknown |
| 0x41C | 100 | Password block (all zero in the IB sample) | Partly known, see below |
| 0x480 | 2 | **Timeout in minutes**, u16 LE (`0F 00` = 15, `78 00` = 120) | **Verified (G2)** |
| 0x482 | 2 | Option flags, u16 LE: `C1 01` in both Custom Modes, `07 00` in IB. Bit 0 is set in all three (Blink LED is the only setting they share for sure) | Unknown |

**Password block (0x41C–0x47F)** in the two Custom Modes, which differ only in the password:

| Offset | Size | Mode 1 vs Mode 2 | Notes |
|---|---|---|---|
| 0x41C | 4 | differ (`E0 9F 6C DB` / `AD A0 95 78`) | random salt, or a checksum |
| 0x420 | 4 | same (`FB 74 29 C7`) | |
| 0x424 | 8 | zero | |
| 0x42C | 16 | same: `D4 1D 8C D9 8F 00 B2 04 E9 80 09 98 EC F8 42 7E` | **MD5 of the empty string**: a hash of something empty in both (not the password) |
| 0x43C | 4 | same (`60 7A E9 DB`) | |
| 0x440 | 64 | differ | 64 bytes, the size of a SHA-512 digest. Not plain MD5/SHA-1/SHA-2/SHA-3/BLAKE2, HMAC or PBKDF2 (1–10000 rounds) of the password (ASCII or UTF-16) with the nearby bytes as salt |

So this project can't set a password. It keeps the block as it is. Whether the block also covers the other settings (so that editing them gets the configuration rejected) is unknown.

**Next samples to take**, each a copy of Custom Mode 1 with one change: Blink LED off; memory Erase; memory Keep; security code off; angle Degrees; angle Radians; one feature disabled (e.g. CAS); and Custom Mode 1 saved again unchanged (does 0x41C change on every save?).

HP's guides list the options as: name, read-only, timeout (8 h max on the calculator), default angle (or none), password (1–10 characters), memory (keep and restore / erase / hide), Blink LED, and a tree of features to disable: System Apps (each app and its functions), saved apps, physics constants, Help, Units, Matrices, complex numbers, CAS, connectivity (I/O), Notes and Programs, New Notes and Programs, and the Math menu down to single commands. None of these is mapped to a bit yet.

**Mapping the options.** Change one option on the calculator, bring the configuration over, and compare it with the previous copy in the exam configuration form (Compare). Record each finding here and in `EXAM_FEATURES`.
