/** Screenshot decoding and comparison for the screen view and the key-injection probe. */
import { decodePrimePng16, type PixelMode, type RgbaImage, type ScreenPayload } from './hid/parsers';

export type { PixelMode, RgbaImage };

/** Decode a screenshot reply. Prime 16-bit PNGs are unpacked here; any other PNG goes to the browser. */
export async function decodeScreen(s: ScreenPayload, mode: PixelMode): Promise<RgbaImage> {
  const img = decodePrimePng16(s.png, mode);
  if (img) return img;
  const bmp = await createImageBitmap(new Blob([s.png as BlobPart], { type: 'image/png' }));
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const d = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** Fraction (0–1) of pixels that differ between two images of the same size; 1 if sizes differ. */
export function diffFraction(a: RgbaImage, b: RgbaImage): number {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let changed = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2]) changed++;
  }
  return changed / n;
}
