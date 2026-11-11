/**
 * App icons: `icon.png` inside the app, 38×38 pixels (the size Python apps on a G2 use, e.g. Dynatris).
 * Any image is center-cropped to a square and scaled to fit.
 */

export const ICON_FILE = 'icon.png';
export const ICON_SIZE = 38;

export interface IconResult {
  png: Uint8Array;
  /** Size of the picked image. */
  width: number;
  height: number;
  /** Whether it had to be cropped (not square) or scaled (not 38×38). */
  cropped: boolean;
  scaled: boolean;
}

/** Center square of a width×height image: [sx, sy, side]. */
export function centerSquare(width: number, height: number): [number, number, number] {
  const side = Math.min(width, height);
  return [Math.floor((width - side) / 2), Math.floor((height - side) / 2), side];
}

/** Turn any image the browser can decode into a 38×38 PNG. */
export async function makeAppIcon(file: Blob): Promise<IconResult> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error("that file isn't an image this browser can read");
  }
  const { width, height } = bmp;
  const [sx, sy, side] = centerSquare(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = ICON_SIZE;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  // Large images: halve in steps first, so the final scale-down doesn't alias.
  let src: CanvasImageSource = bmp;
  let s = side;
  let ox = sx;
  let oy = sy;
  while (s > ICON_SIZE * 2) {
    const half = Math.ceil(s / 2);
    const step = document.createElement('canvas');
    step.width = step.height = half;
    const sg = step.getContext('2d')!;
    sg.imageSmoothingQuality = 'high';
    sg.drawImage(src, ox, oy, s, s, 0, 0, half, half);
    src = step;
    s = half;
    ox = oy = 0;
  }
  g.drawImage(src, ox, oy, s, s, 0, 0, ICON_SIZE, ICON_SIZE);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error("couldn't encode the icon");
  return {
    png: new Uint8Array(await blob.arrayBuffer()),
    width,
    height,
    cropped: width !== height,
    scaled: side !== ICON_SIZE,
  };
}

/** Pick an image file with the browser's file dialog; null when canceled. */
export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
