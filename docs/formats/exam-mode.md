# Exam-mode configurations (object type `0B`, `.hpexammode`)

How an exam-mode configuration is stored. Most of it is not yet understood.

Marks (**Verified (G2)**, **Reference**, …) are explained in [the protocol reference](../PROTOCOL.md#how-sure-each-fact-is).

Code: `src/lib/files/exam.ts`.

**Unverified.** The only sample is a Connectivity Kit `.hpexammode` file (the IB Diploma Programme configuration on hpcalc.org, 1156 bytes). Whether a type-`0B` object body is byte-for-byte the same is untested.

| Offset | Size | Content |
|---|---|---|
| 0 | 64 | Name, UTF-16LE, NUL-padded (`IB Exam Mode`) |
| 64 | 1088 | Options and disabled-feature bits. Sample nonzero bytes: `40: 86 06 00 00 00 02 00 00 00 00 00 80 01`, `5B: D0 81 3F 1C E0 00 01 00 C0`, `CC: 50` |
| 1152 | 4 | `78 00 07 00` (perhaps a 120-minute timeout and flags) |

HP's guides list the options as: name, read-only, timeout (8 h max on the calculator), default angle (or none), password (1–10 characters), memory (keep and restore / erase / hide), Blink LED, and a tree of features to disable: System Apps (each app and its functions), saved apps, physics constants, Help, Units, Matrices, complex numbers, CAS, connectivity (I/O), Notes and Programs, New Notes and Programs, and the Math menu down to single commands. None of these is mapped to a bit yet.

**Mapping the options.** Change one option on the calculator, bring the configuration over, and compare it with the previous copy in the exam configuration form (Compare). Record each finding here and in `EXAM_FEATURES`.
