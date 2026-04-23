/**
 * サーバー側画像前処理（Vision API に渡す前の品質向上）
 *
 * 葬儀現場は蛍光灯下 + 手持ち撮影 + 鉛筆や薄いボールペン書きが混在し、
 * Vision API がそのまま受けると手書きの薄い線や小さい文字を取りこぼす。
 *
 * ここで以下を適用する:
 *  ① EXIF 情報に基づく自動回転（iPhone の縦横問題を吸収）
 *  ② 長辺リサイズ（処理高速化・ファイルサイズ削減）
 *  ③ グレースケール化（色ノイズを落として線だけ強調）
 *  ④ normalize（ヒストグラム伸張でコントラストを最大化）
 *  ⑤ linear（明るさ・コントラストの微調整）
 *  ⑥ sharpen（エッジ強調で細い線を復活）
 *  ⑦ JPEG再エンコード（品質90、手書き線を保持）
 *
 * 失敗時は元バッファをそのまま返し、OCRフロー全体を止めない設計。
 */

import sharp from 'sharp';

export type PreprocessResult = {
  buffer: Buffer;
  mimeType: string;
  appliedPreprocess: boolean;
  debugInfo?: {
    originalSize: number;
    processedSize: number;
    width?: number;
    height?: number;
    elapsedMs: number;
  };
};

/**
 * OCR向けの画像前処理。
 * 長辺2400px、グレースケール、コントラスト強調、シャープネス適用。
 */
export async function preprocessForOcr(input: Buffer): Promise<PreprocessResult> {
  const started = Date.now();
  const originalSize = input.length;

  try {
    const base = sharp(input, { failOn: 'none' }).rotate(); // EXIF 自動回転

    // 元サイズを取得してリサイズ判定
    const meta = await base.metadata();
    const pipeline = sharp(input, { failOn: 'none' })
      .rotate()
      // 長辺2400px制限。芳名カード程度ならこれで十分な解像度
      .resize({
        width: 2400,
        height: 2400,
        fit: 'inside',
        withoutEnlargement: true,
      })
      // カラー情報は手書きOCRに不要、むしろノイズになりがち
      .grayscale()
      // ヒストグラム伸張: 最暗点→0, 最明点→255 にストレッチ
      .normalize()
      // 明度を少し下げてコントラストを少し上げる
      //   linear(a, b) は出力 = a * 入力 + b
      //   a=1.15 でコントラストUP、b=-15 で全体を少し暗く
      .linear(1.15, -15)
      // シャープネス。sigma が大きいほど強い（鉛筆書き対応）
      .sharpen({ sigma: 1.2, m1: 1.0, m2: 2.0 })
      // JPEG再エンコード。quality 90 は文字のエッジを残す十分な値
      .jpeg({ quality: 90, progressive: true, mozjpeg: false });

    const buffer = await pipeline.toBuffer();
    const elapsedMs = Date.now() - started;

    console.log(
      `[preprocess] ${originalSize} bytes → ${buffer.length} bytes (${elapsedMs}ms), ${meta.width}x${meta.height}`
    );

    return {
      buffer,
      mimeType: 'image/jpeg',
      appliedPreprocess: true,
      debugInfo: {
        originalSize,
        processedSize: buffer.length,
        width: meta.width,
        height: meta.height,
        elapsedMs,
      },
    };
  } catch (err) {
    console.warn('[preprocess] 画像前処理に失敗。元画像をそのまま使用:', err);
    return {
      buffer: input,
      mimeType: 'image/jpeg',
      appliedPreprocess: false,
      debugInfo: {
        originalSize,
        processedSize: originalSize,
        elapsedMs: Date.now() - started,
      },
    };
  }
}
