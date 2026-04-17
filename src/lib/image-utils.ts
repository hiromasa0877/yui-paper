/**
 * 画像ユーティリティ — クライアント側で動作。
 *
 * - OCR向けに画像をリサイズ＆JPEG再エンコードする
 *   - iPhone写真は10MB前後まで膨らみ、Vercel Serverless の 4.5MB body制限を超えやすい
 *   - 長辺2000pxあれば手書きOCRは十分（Vision/Geminiの理論上限はもっと大きいが解像度を上げても精度は頭打ち）
 * - HEIC等もブラウザのImage decoderが対応している場合は再エンコードで吸収できる
 */

const MAX_LONG_EDGE = 2000; // 長辺の最大ピクセル数
const TARGET_QUALITY = 0.85; // JPEG品質
const MAX_TARGET_SIZE_BYTES = 3.5 * 1024 * 1024; // 圧縮後の上限目安

/**
 * File を OCR向けに最適化された JPEG に変換する。
 * 元ファイルが既に小さい場合はそのまま返す。
 */
export async function compressImageForOcr(file: File): Promise<File> {
  // すでに十分小さい場合は何もしない
  if (file.size <= MAX_TARGET_SIZE_BYTES && file.type === 'image/jpeg') {
    return file;
  }

  try {
    const bitmap = await loadBitmap(file);
    const { width, height } = scaleToMaxEdge(bitmap.width, bitmap.height, MAX_LONG_EDGE);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');

    // 高品質リサンプリング
    ctx.imageSmoothingEnabled = true;
    (ctx as any).imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    // bitmap を解放
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }

    let quality = TARGET_QUALITY;
    let blob = await canvasToBlob(canvas, quality);

    // 上限を超えたら品質を段階的に下げる
    while (blob && blob.size > MAX_TARGET_SIZE_BYTES && quality > 0.5) {
      quality -= 0.1;
      blob = await canvasToBlob(canvas, quality);
    }

    if (!blob) {
      // 圧縮失敗時は元ファイルを返す
      return file;
    }

    const compressedName = file.name.replace(/\.(heic|heif|png|webp|gif|jpg|jpeg)$/i, '') + '.jpg';
    return new File([blob], compressedName, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (e) {
    console.warn('画像圧縮に失敗。元ファイルをそのまま使用します:', e);
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  // ImageBitmap が使える環境（モバイルChrome/Safari含むモダンブラウザ）はそちらを優先
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // HEIC等createImageBitmapが対応しない形式はHTMLImageElementにフォールバック
    }
  }
  return await loadHtmlImage(file);
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function scaleToMaxEdge(w: number, h: number, maxEdge: number) {
  const longest = Math.max(w, h);
  if (longest <= maxEdge) return { width: w, height: h };
  const ratio = maxEdge / longest;
  return { width: Math.round(w * ratio), height: Math.round(h * ratio) };
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/jpeg', quality);
  });
}
