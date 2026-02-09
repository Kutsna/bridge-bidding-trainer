/*import { predictRank } from "./rankModel";
import { predictSuit } from "./suitModel";

export async function recognizeCard(
  cornerCanvas: HTMLCanvasElement,
): Promise<{ rank: string; suit: string }> {
  const [rank, suit] = await Promise.all([
    predictRank(cornerCanvas),
    predictSuit(cornerCanvas),
  ]);

  return { rank, suit };
}
*/

import { loadRankModel, predictRank } from "./rankModel";
import { loadSuitModel, predictSuit } from "./suitModel";
import * as tf from "@tensorflow/tfjs";

export async function recognizeCard(canvas: HTMLCanvasElement) {
  await loadRankModel();
  await loadSuitModel();

  const rankRes = await predictRank(canvas);
  const suitRes = await predictSuit(canvas);

  return {
    rank: rankRes.rank,
    suit: suitRes.suit,
    rankConfidence: rankRes.confidence,
    suitConfidence: suitRes.confidence,
  };
}

export function preprocessCorner(
  canvas: HTMLCanvasElement,
  size = 32,
): tf.Tensor4D {
  return tf.tidy(() => {
    const img = tf.browser.fromPixels(canvas, 1); // grayscale
    const resized = tf.image.resizeBilinear(img, [size, size]);
    const normalized = resized.div(255);
    return normalized.expandDims(0) as tf.Tensor4D;
  });
}