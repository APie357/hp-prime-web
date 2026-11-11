# HP Prime G2 USB protocol

A reference for the protocol a computer uses to talk to an **HP Prime G2** over USB. It covers what this project uses, what was verified on real hardware, and what is only known from other projects. The code that implements it is in `src/lib/hid/`.

HP does not publish this protocol. Everything here comes from other open-source projects, from disassembly of HP's Connectivity Kit done by those projects, and from tests on a G2.

## How sure each fact is

Each section is marked with one of these:

| Mark | Meaning |
|---|---|
| **Verified (G2)** | Tested on a real G2 with this project (firmware V2.060.650, legacy framing), 2026-11-09/10. |
| **Verified (G1)** | Tested on a G1 by another project, not yet on the G2. |
| **Reference** | Taken from another project's code or notes. Not tested here. |
| **Unknown** | Nobody has worked it out. Listed so it isn't mistaken for a known fact. |

**Sources:**

- [`debrouxl/hplp`](https://github.com/debrouxl/hplp) (`libhpcalcs/src/prime_vpkt.c`, `prime_cmd.c`): the original legacy framing and command set. GPL, used only as a reference.
- [`56phil/prime_connection_kit`](https://github.com/56phil/prime_connection_kit) ("pck"), MIT: legacy framing confirmed on a G2 (firmware V2.060.650), plus note formatting.
- [`golba98/hp-prime-emulator`](https://github.com/golba98/hp-prime-emulator) ("hpemu"), MIT: G1 hardware tests (firmware 2.2.15157), the `EB` delete format taken from the Connectivity Kit binary, and screenshot formats.
- [`BeatSkip/PrimeDev`](https://github.com/BeatSkip/PrimeDev): a WebHID app for the G2 using the newer **V2** framing, plus the key-code table.

---

## 1. USB and HID

| | |
|---|---|
| Vendor ID | `0x03F0` (HP) |
| Product IDs | `0x0441` early G1 firmware · `0x1541` G1 (firmware ≥ 8151) · **`0x2441` G2** |
| Class | Vendor-defined HID, one interface |
| Report IDs | Unnumbered (report ID 0). With WebHID, `sendReport(0, data)` where `data` does not include the ID. |
| Report size | **1024 bytes on the G2** (64 on the G1), in both directions. |

**Verified (G2).** Read the report size from the HID descriptor, not from the model: `reportSize × reportCount / 8` of report 0 in `HIDDevice.collections[].inputReports/outputReports`. The payload capacity of one report is the report size minus 1, because the first byte is the sequence number (§2).

- **Input reports** from the calculator always arrive full-size and zero-padded. Unused bytes may also hold leftovers from earlier messages (§9.2), so take lengths from the message header, never from the report.
- **Output reports** can be sent short (unpadded) on Linux/Chrome, and the G2 accepts them. Nobody has tested whether padding is ever *required*; the console has a "pad reports" switch for that.
- On Linux, Chrome needs hidraw access: `udev/60-hp-prime.rules` tags the three product IDs with `TAG+="uaccess"`.
- Unplugging fires the WebHID `disconnect` event, and plugging back in fires `connect`; recovery after a replug is **verified (G2)**. A device the user has already granted can be reopened with `navigator.hid.getDevices()` without a picker (used for auto-reconnect; not yet confirmed on hardware).

---

## 2. Legacy framing

**Verified (G2).** Every Prime understands this framing. The G2 also supports a newer negotiated framing (§12), but it only switches when asked, so a host that never asks stays in legacy framing.

A **message** (a command and its data, §3) is split across one or more HID reports:

```
report = [seq][up to N payload bytes]          N = report size − 1 (1023 on the G2)
```

- `seq` is `0x00` for a message's first report, then counts up, `0xFE` wraps to `0x00`, and **`0xFF` is never used** as a sequence number.
- An incoming report with `seq = 0xFF` is **out of band**. It isn't part of any message; skip it.
- The receiver joins the payloads in order. A message is complete when it reaches the length given in its header (§3), or when a short report arrives (only possible from unpadded senders).
- An incoming report with `seq = 0x00` while a message is half-received starts a new message; drop the partial one.
- The link is **half-duplex, with no flow control or acknowledgments** in legacy framing. Send one request, read its reply (if any), then send the next. This project funnels every operation through one queue (`PrimeSession`).

Example: the 8-byte message `F2 01 00 00 00 02 00 00` goes out as one report, `00 F2 01 00 00 00 02 00 00`.

---

## 3. Message format

Most messages, in both directions, start with a 6-byte header:

```
[cmd] [ver] [len: u32 big-endian] [len bytes of body]          total = 6 + len
```

- `cmd` is the command byte (§4).
- `ver` is `0x01` in everything legacy hosts send and everything the G2 has sent us. According to hpemu, the Connectivity Kit sets this byte from a per-connection "format" field. PrimeDev uses `0x03` in V2 mode, where a body may be compressed (§12). **Reference.**
- `len` counts only the bytes after the header.

There are a few exceptions without this header:

| Message | Bytes |
|---|---|
| Host requests with no data | Just the command: `FF` (ready), `FA` (info), `F9` (backup). `FC fmt` (screenshot) is two bytes. |
| Ready reply | The single byte `59` (`'Y'`). Very old firmware echoed `FF`. |

Telling them apart when receiving: if byte 1 is `0x01` (and byte 0 isn't `0x59`), it's a headed message of `6 + len` bytes. If byte 0 is `0x59` or `0xFF`, it's a 1-byte ready reply. Anything else is unknown, so take the whole first report.

### 3.1 CRC-16

**Verified (G2).** File, request and delete messages (§5) and screenshots (§8) carry a **CRC-16/XMODEM**: polynomial `0x1021`, initial value 0, not reflected, no final XOR. Python's `binascii.crc_hqx(data, 0)` computes the same thing. Where the CRC sits and what it covers differs by message; see those sections.

---

## 4. Command summary

| Cmd | Name | Direction | Reply | Status |
|---|---|---|---|---|
| `FF` | Ready check | host → calc | `59` (`'Y'`) | Verified (G2) |
| `FA` | Device info | host → calc | `FA 01 len …` | Verified (G2) |
| `FC` | Screenshot | host → calc | `FC 01 len …PNG` | Verified (G2) |
| `F9` | Backup (send everything) | host → calc | a stream of `F7` messages, then an `F9` frame | Verified (G2) |
| `F8` | Request one object | host → calc | `F7`, or **nothing** if the object doesn't exist | Verified (G2) |
| `F7` | File (one object) | both | **none** when the host sends one; `F9` means refused | Verified (G2) |
| `EB` | Delete one object | host → calc | **none** | Verified (G2) |
| `F2` | Chat message | both | none | Verified (G2) |
| `EC` | Key press | host → calc | none (keys are queued, see §10) | Partly verified (G2) |
| `E7` | Set date and time | host → calc | none | Verified (G2) |
| `FD` | "Max protocol version" | ? | ? | Unknown (PrimeDev names it, never uses it) |
| `ED`, `EE`, `EF`, `F0`, `F1`, `FB` | Used inside the Connectivity Kit's built-in emulator | – | – | Reference (hpemu), not for real hardware |

The Connectivity Kit's message handler accepts `F2`…`FD`, so `F3`–`F6` probably mean something. Nobody has documented them. **Unknown.**

---

## 5. Named objects: `F7`, `F8`, `EB`

Programs, notes, apps, variables and settings travel as **named objects**. The file (`F7`), request (`F8`) and delete (`EB`) messages share one layout:

```
offset  size  field
0       1     cmd                 F7 / F8 / EB
1       1     ver                 01
2       4     len (u32 BE)        total length − 6
6       1     type                object type (§5.1)
7       1     nameLen             length of the name in BYTES (UTF-16LE, so 2 × characters)
8       2     crc (u16 LE)        CRC-16/XMODEM, see below
10      n     name                UTF-16LE, no BOM
10+n    …     data                object body (F7 only)
```

**CRC:** set bytes 8–9 to zero, then run the CRC over the **first `total − 6` bytes** of the message (that is, `len` bytes counted from offset 0, *not* from the body). Store it little-endian at bytes 8–9. Odd as it is, this matches hplp, the Connectivity Kit binary (per hpemu), and the G2's own replies. Example, checked against a G2 capture:

```
F8 request for program NEWPROG (note the name's NUL terminator, §5.3):
F8 01 00 00 00 14 06 10 9D 91  4E 00 45 00 57 00 50 00 52 00 4F 00 47 00  00 00
                  │  │  └CRC 0x919D
                  │  └nameLen 16 (7 chars + NUL)
                  └type 06 (program)
```

### 5.1 Object types

| Type | Object | Notes |
|---|---|---|
| `00` | Settings | e.g. `calc.hpsettings`, `cas.hpsettings`, `calc.hpvars` in a backup (PrimeDev) |
| `02` | **App** | [App](formats/app.md). Verified (G2) for reading |
| `03` | List | |
| `04` | Matrix | |
| `05` | **Note** | [Note](formats/note.md). Verified (G2) |
| `06` | **Program** | [Program](formats/program.md). Verified (G2) |
| `07` | App note | An app's Info note |
| `08` | App program | An app's program |
| `09` | Complex | |
| `0A` | Real | |
| `0B` | Exam-mode configuration | [Exam mode](formats/exam-mode.md). Format mostly unknown |

Types `02`, `05` and `06` are verified on the G2. The rest come from PrimeDev and hpemu and show up in `F9` backups. Their body formats are not documented here, and this project stores them as raw bytes.

### 5.2 `F7`: send an object (host → calculator)

**Verified (G2).** The host sends `F7` with the body after the name. The G2 sends **no acknowledgment**: silence for about 1.5 s means it was accepted. A reply starting with `F9` is treated as a refusal (from older references; never seen on the G2). To be sure it arrived, read it back with `F8` and compare.

Writing an existing name **overwrites it without asking**. Check first with `F8` if that matters.

Size: G1 firmware silently dropped program uploads over about 15,928 bytes (hpemu). The G2 accepted a program over 16 KB in our tests, and its real limit is unknown.

### 5.3 `F8`: request an object

**Verified (G2).** This is the file layout with an empty body, but **the name must end with a UTF-16 NUL (`00 00`)**, which counts in `nameLen`. Without it the calculator never answers.

- If the object exists, the reply is an `F7` (calculator → host) with the same layout, whose body is the object.
- If the object doesn't exist, **there is no reply at all**, so the host has to time out. 1.5–4 s works.
- Names are **case-sensitive**.

### 5.4 `EB`: delete an object

**Verified (G2).** This is the named-object layout with **no body and no NUL** after the name (the format hpemu found in Connectivity Kit 2.4.2). The G2 **sends no reply**. To confirm, send an `F8` for the same name: silence means it's gone.

```
Delete program NEWPROG (captured on the G2):
EB 01 00 00 00 12 06 0E EF A7  4E 00 45 00 57 00 50 00 52 00 4F 00 47 00
```

### 5.5 `F7` replies may be compressed

**Reference (PrimeDev).** In V2 mode an `F7` body may be zlib-compressed. You can tell because the CRC field is `00 00` and byte 10 is `0x78`, a zlib header. Inflate from offset 10 to get the rest of the message, starting with the name. The G2 has never sent a compressed message in legacy mode, but the parser handles it anyway.

---

## 6. Object bodies

The layout of each object type's body is documented separately:

| Type | Object | Document |
|---|---|---|
| `02` | App | [formats/app.md](formats/app.md) |
| `05` | Note | [formats/note.md](formats/note.md) |
| `06` | Program | [formats/program.md](formats/program.md) |
| `0B` | Exam-mode configuration | [formats/exam-mode.md](formats/exam-mode.md) |

### 6.1 Names

Program names must be valid identifiers: a letter or `_`, then letters, digits or `_`. This project also caps them at 64 characters. The calculator's own limits haven't been tested. In any message, a name can be at most 255 bytes (127 UTF-16 characters), because `nameLen` is one byte.

### 6.2 Objects the calculator sends by itself

**Verified (G2).** The calculator's **Send** softkey (Apps screen, Program Catalog, Notes catalog) pushes the selected object to the host as an ordinary `F7` message (§5), without any request and without a closing frame. The host has to be reading while idle, as for chat (§9.2). An `F7` that arrives while the host waits for some other reply belongs to this too. This project collects whatever arrives within 1.5 s and asks before saving it.

## 7. `F9`: backup (read everything)

**Verified (G2).** The host sends the single byte `F9`. The calculator then sends **every object** as a series of `F7` messages (§5), one after another without being asked, and finishes with a message starting with `F9`. Seeing that `F9` is verified on the G2; its exact bytes weren't recorded. The whole thing takes roughly 20 s.

- Wait up to about 10 s for the first object; it starts slowly. Between objects, waiting about 5 s is enough.
- Firmware that never sends the final `F9` can be handled by treating a quiet period as the end.
- This is the only way to **list** what's on the calculator. There is no directory command.

---

## 8. `FC`: screenshot

**Verified (G2)** for format `08`.

Request: `FC fmt` (2 bytes, no header). Reply:

```
offset  field
0       FC
1       01
2       len (u32 BE)
6       crc (u16 BE)        CRC-16/XMODEM over bytes 6…end, with these two bytes zeroed
8       fmt                 echoes the request
9       x (u16 LE)          FF FF FF FF = full image at the origin; otherwise a partial
11      y (u16 LE)          update to draw at (x, y) (Connectivity Kit; hpemu)
13      PNG file
```

Note that this CRC is **big-endian** and covers the body, unlike the named-object CRC (§5).

| fmt | Size | PNG contents | Status |
|---|---|---|---|
| `08` | 320×240 | 16-bit grayscale PNG whose samples are packed color | **Verified (G2): little-endian RGB555** |
| `09` | 320×240 | Palette PNG (reduced colors) | Verified (G1) |
| `0A` | 160×120 | Like `08`, half size | Verified (G1) |
| `0B` | 160×120 | Like `09`, half size | Verified (G1) |
| `04`/`05`/`0C`/`0D`/… | | "Changed rectangle" variants used by the Connectivity Kit for live view | Reference. On the G1, `0D` often returned 1×1 frames |

**Color decoding:** the PNG is "16-bit grayscale", but each sample holds a pixel's color. On the **G2**, read the sample as little-endian `v`, then `r = (v>>10)&31, g = (v>>5)&31, b = v&31` (RGB555), and widen each value to 8 bits with `(c<<3)|(c>>2)`. On the **G1**, hpemu reports big-endian RGB565 instead. A browser's own PNG decoder converts the samples to gray, which is why this project has its own decoder (`decodePrimePng16`).

The first byte of a reply can take about 1 s to arrive. The live mirror polls continuously and works on the G2; its frame rate and behavior while a program runs haven't been measured.

---

## 9. `F2`: chat (Messages app)

**Verified (G2).** This is how the calculator's **Messages** app talks to the Connectivity Kit's classroom tools.

### 9.1 Host → calculator

```
F2 01 [len u32 BE] [text, UTF-16LE]
```

The text appears in the calculator's Messages app. This project sends it without a trailing NUL. A NUL-only body is special (§9.3). PrimeDev sends `F2 03 …` instead (§3); that form is untested here.

### 9.2 Calculator → host

The calculator sends these **on its own, at any time**, when the user replies in Messages:

```
F2 01 [len u32 BE] [text, UTF-16LE] [00 00]            len includes the NUL
```

Text and equations both arrive as plain text (`67^2/sqrt(666)`). The report usually carries **leftover bytes after `len`**, from earlier messages and the info string. Ignore everything past `6 + len`.

Because these arrive unrequested, a host has to keep reading while idle. Otherwise the message sits in the input queue and gets thrown away (or mistaken for a reply) by the next request. A chat can also arrive just before the reply the host is waiting for, so the reader has to handle that.

### 9.3 Help requests

| | Bytes | Effect |
|---|---|---|
| Calculator: **Help** key in Messages | `F2 01 00 00 00 02 00 00` | Sets the Help• flag (the dot on the Help label). Every press sends the same bytes; the key only turns it on. |
| Host: **clear help** | `F2 01 00 00 00 02 00 00` | Clears the Help• flag. |

An empty chat message (body = NUL only) is the help signal in both directions. **Verified (G2), 2026-11-10.**

---

## 10. `EC`: key presses

Sending keys works on the G2, but the calculator doesn't act on them right away; see below.

```
EC 01 [len u32 BE] [key code] …          one byte per key (hplp)
```

**Behavior on the G2 (verified):** the calculator **queues** keys sent this way but doesn't process them. They take effect when the next physical key is pressed, just before that key's own input. Afterwards the battery icon may disappear from the status bar. All the variants tried behaved the same way:

- one key per message, with gaps between them;
- many keys in one message;
- a key followed by `key | 0x80`;
- keys followed by a ready check.

**But** the full "Send & Run" sequence (Home, Esc, the program's name, Enter, sent one key per message with an 80 ms gap and with screenshots around it) **does start the program**. Why that works when single keys don't is unknown.

On the G1 (firmware 2.2.15157), `EC` had no visible effect at all (hpemu).

**Key codes** are the same numbers `GETKEY` returns (PrimeDev `HpKey.cs`). The letter in brackets is what the key types after Alpha. Alpha then key gives an upper-case letter; **Alpha, Shift, key gives lower case (verified on the G2)**.

| Code | Key | Code | Key | Code | Key |
|---|---|---|---|---|---|
| 0 | Apps | 17 | xtθn (D) | 34 | 9 (S) |
| 1 | Symb | 18 | a b/c (E) | 35 | ÷ (T) |
| 2 | ▲ | 19 | Del | 36 | Alpha |
| 3 | Help | 20 | xʸ (F) | 37 | 4 (U) |
| 4 | Esc | 21 | SIN (G) | 38 | 5 (V) |
| 5 | Home | 22 | COS (H) | 39 | 6 (W) |
| 6 | Plot | 23 | TAN (I) | 40 | × (X) |
| 7 | ◀ | 24 | LN (J) | 41 | Shift |
| 8 | ▶ | 25 | LOG (K) | 42 | 1 (Y) |
| 9 | View | 26 | x² (L) | 43 | 2 (Z) |
| 10 | CAS | 27 | +/− (M) | 44 | 3 |
| 11 | Num | 28 | ( ) (N) | 45 | − |
| 12 | ▼ | 29 | , (O) | 46 | On |
| 13 | Menu | 30 | Enter | 47 | 0 |
| 14 | Vars (A) | 31 | EEX (P) | 48 | . |
| 15 | Toolbox (B) | 32 | 7 (Q) | 49 | Space |
| 16 | ▫√ (C) | 33 | 8 (R) | 50 | + |

There is no USB command to run a program. Typing its name on the Home screen is the only way.

---

## 11. `E7`: set date and time

**Verified (G2).** The time zone is local; the calculator has no time-zone setting.

```
E7 01 00 00 00 0A  00 00 54 1E  YY MM DD hh mm ss
                   └ fixed, meaning unknown
YY = year − 2000; MM = 1–12
```

There is no reply, so follow it with a ready check (`FF` → `59`) to confirm the link is still healthy.

---

## 12. V2 framing (not used by this project)

**Reference (PrimeDev).** The G2 (firmware build ≥ 10591) supports a framing with message IDs, acknowledgments and retransmission. Legacy framing works fine on the G2, so this project doesn't use V2. It's documented here for completeness.

**Switching:** after getting an `FA` reply in legacy framing, the host sends one **out-of-band** report (sequence `0xFF`):

```
FF EC 00 00 00 00 00 00
```

From then on, reports have these shapes (first byte = frame kind):

| First byte | Frame | Layout |
|---|---|---|
| `01` | First frame of a message | `01 [msgId u32 LE] [size u32 LE] [up to 1015 bytes]` |
| `02`…`FD` | Continuation | `[seq] [up to 1023 bytes]` (seq counts up from 2) |
| `FE` | ACK / NACK | `FE [01 = ack, 00 = nack] [seq to resend] 00 [position u32 LE] [msgId u32 LE]` |
| `FE … FF` | Out of band | `FE`, with byte 2 = `FF` |
| `00` | Legacy frame | §2 |

- The receiver ACKs each complete message with its `msgId`. A NACK names the sequence number to send again.
- Messages inside V2 frames use the same `cmd ver len …` layout as §3. PrimeDev sends `ver = 03` and supports a compressed form, where the CRC field is `00 00` and the size is u32 LE, followed by a zlib stream.
- A message can be up to `240 × 1023 − 8` bytes, according to PrimeDev's validity check.

---

## 13. `FA`: device info

**Verified (G2)** that it answers; the layout is only partly understood.

The request is the single byte `FA`. The reply is `FA 01 len …`, and the body ends with fixed-size fields. These offsets are counted back from the end of the message (PrimeDev, hpemu):

| From end | Field |
|---|---|
| −16 | Serial number: 10 ASCII characters (16-byte field) |
| −32 | Firmware version: 10 ASCII characters, e.g. `V2.060.650` |
| −36 | Firmware build number, u16 LE (e.g. `15157` on a G1) |

Earlier in the body there are UTF-16 strings, including the calculator's name. This project pulls out every readable string and picks the fields heuristically, as pck does.

---

## 14. Timing used by this project

These values work on the G2. They are not protocol limits.

| Wait | Time |
|---|---|
| First report of a reply | 4 s (screenshot 8 s, backup 10 s) |
| Between reports of one message | 2.5 s |
| Treat `F7` as accepted after silence | 1.5 s |
| `F8` "object missing" timeout | 1.5 s (existence check) to 4 s (fetch) |
| Pause before read-back after `F7` | 250 ms |
| Between `EC` key messages | 80 ms |
| Idle read while listening for chat | 1 s at a time; it yields at once when a request is queued |

Before each request, the host discards any input reports still queued, so a late reply to an earlier request can't be mistaken for the new one. While chat listening is on, unrequested chat is picked up before that happens.

---

## 15. Open questions

- Why does the Send & Run key sequence take effect, when single keys only queue (§10)? Is there a key sequence for `_`?
- The meaning of `F3`–`F6` and `FD`, and of the second header byte (`01` vs `03`).
- Whether output reports ever need padding to 1024 bytes.
- The maximum program size the G2 accepts.
- Body formats for types other than programs, notes and apps. Could restoring raw backup objects with `F7` be safe?
- Whether the calculator accepts an app sent with `F7` (and a new app made from another app's bag), and whether `F8` fetches a single app.
- What the 36-byte program stub in the built-in Function and Triangle Solver apps is.
- The fixed `00 00 54 1E` bytes in `E7`.
- The full `FA` reply layout on the G2.
- Whether the G1 (`0x1541`, 64-byte reports) behaves the same for everything above.
