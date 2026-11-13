export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser time to start the download before releasing the memory.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function isSupportedImage(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name);
}

export function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsDataURL(file);
  });
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The picture could not be decoded.'));
    img.src = url;
  });
}

const MAX_IMPORT_SIDE = 4096;

export interface ImportedImage {
  dataUrl: string;
  width: number;
  height: number;
  name: string;
}

/**
 * Reads a JPG / PNG / WebP file. Very large photographs are scaled down so the
 * browser stays responsive (longest side <= 4096 px). PNG and WebP stay lossless-ish
 * PNG so transparency is kept; JPG stays JPEG at high quality.
 */
export async function importImageFile(file: File): Promise<ImportedImage> {
  if (!isSupportedImage(file)) throw new Error(`"${file.name}" is not a JPG, PNG or WebP picture.`);
  const original = await readFileAsDataUrl(file);
  const img = await loadImage(original);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const name = file.name.replace(/\.[^.]+$/, '') || 'Image';
  if (longest <= MAX_IMPORT_SIDE && file.type !== 'image/webp') {
    return { dataUrl: original, width: img.naturalWidth, height: img.naturalHeight, name };
  }
  const k = Math.min(1, MAX_IMPORT_SIDE / longest);
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const isJpeg = file.type === 'image/jpeg';
  return { dataUrl: canvas.toDataURL(isJpeg ? 'image/jpeg' : 'image/png', 0.95), width: w, height: h, name };
}

export function pickFile(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = 'none';
    input.onchange = () => {
      resolve(Array.from(input.files ?? []));
      input.remove();
    };
    input.oncancel = () => {
      resolve([]);
      input.remove();
    };
    document.body.appendChild(input);
    input.click();
  });
}
