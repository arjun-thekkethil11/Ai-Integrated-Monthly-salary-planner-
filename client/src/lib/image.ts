// Client-side image resize/compress before sending to the AI vision
// endpoints. Keeps payloads small (faster upload, cheaper for the free-tier
// model) while staying legible enough for OCR-style screenshot reading.
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Couldn't read that file"));
    reader.readAsDataURL(file);
  });
}

/**
 * Loads an image file, downscales it so its longest edge is at most
 * MAX_DIMENSION, and re-encodes it as a compressed JPEG data URL. Screenshots
 * from payment apps are usually tall/narrow and far larger than needed for
 * the model to read text reliably, so this meaningfully shrinks upload size.
 */
export async function resizeImageForAi(file: File): Promise<string> {
  const original = await fileToDataUrl(file);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load that image"));
    el.src = original;
  });

  const { width, height } = img;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return original; // fall back to original if canvas isn't available

  // White background first — screenshots with transparency (rare, but some
  // exported PNGs have it) would otherwise turn black once re-encoded as JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  try {
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return original;
  }
}
