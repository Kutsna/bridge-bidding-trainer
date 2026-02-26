/*
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
*/

import * as tf from '@tensorflow/tfjs';
import { getRankModel } from './rankModel';
import { getSuitModel } from './suitModel';

const RANK_CLASSES = [
  "A","K","Q","J","T",
  "9","8","7","6","5","4","3","2"
];

const SUIT_CLASSES = ["S","H","D","C"];

export type RecognizeCardResult = {
  rank: string;
  suit: "S" | "H" | "D" | "C";
  rankConfidence: number;
  suitConfidence: number;
};

export const recognizeCard = async (imageData: ImageData) => {
  const rankModel = getRankModel();
  const suitModel = getSuitModel();

  if (!rankModel || !suitModel) return null;

  const tensor = tf.browser
  .fromPixels(imageData)
  .toFloat()
  .div(255)
  .sub(0.5)
  .mul(2)
  .resizeBilinear([96, 96])
  .expandDims(0);

  const rankPred = rankModel.predict(tensor) as tf.Tensor;
  const suitPred = suitModel.predict(tensor) as tf.Tensor;

  const rankData = Array.from(await rankPred.data());
  const suitData = Array.from(await suitPred.data());

  tensor.dispose();
  rankPred.dispose();
  suitPred.dispose();

  const rankBest = Math.max(...rankData);
  const suitBest = Math.max(...suitData);

  const rankIndex = rankData.indexOf(rankBest);
  const suitIndex = suitData.indexOf(suitBest);

  if (rankIndex < 0 || suitIndex < 0) return null;

  return {
    rank: RANK_CLASSES[rankIndex],
    suit: SUIT_CLASSES[suitIndex] as "S" | "H" | "D" | "C",
    rankConfidence: Number(rankBest || 0),
    suitConfidence: Number(suitBest || 0),
  } as RecognizeCardResult;
};