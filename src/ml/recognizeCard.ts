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

export const recognizeCard = async (imageData: ImageData) => {
  const rankModel = getRankModel();
  const suitModel = getSuitModel();

  if (!rankModel || !suitModel) return null;

  const tensor = tf.browser
    .fromPixels(imageData)
    .resizeBilinear([96, 96])
    .toFloat()
    .div(255)
    .expandDims(0);

  const rankPred = rankModel.predict(tensor) as tf.Tensor;
  const suitPred = suitModel.predict(tensor) as tf.Tensor;

  const rankData = await rankPred.data();
  const suitData = await suitPred.data();

  tensor.dispose();
  rankPred.dispose();
  suitPred.dispose();

  const rankIndex = rankData.indexOf(Math.max(...rankData));
  const suitIndex = suitData.indexOf(Math.max(...suitData));

  console.log("Rank raw:", await rankPred.data());
  console.log("Suit raw:", await suitPred.data());

  return RANK_CLASSES[rankIndex] + SUIT_CLASSES[suitIndex];
};