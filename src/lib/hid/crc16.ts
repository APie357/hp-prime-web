/**
 * CRC-16/XMODEM (CCITT polynomial 0x1021, init 0, no reflection) — the
 * checksum the HP Prime uses for file and screenshot messages.
 */
const TABLE = (() => {
  const t = new Uint16Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i << 8;
    for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    t[i] = c;
  }
  return t;
})();

export function crc16(buf: Uint8Array, start = 0, end = buf.length): number {
  let crc = 0;
  for (let i = start; i < end; i++) crc = (TABLE[((crc >> 8) ^ buf[i]) & 0xff] ^ (crc << 8)) & 0xffff;
  return crc;
}
