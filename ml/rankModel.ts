import * as tf from "@tensorflow/tfjs";
import { preprocessCorner } from "./preprocess";

let rankModel: tf.LayersModel | null = null;

export const RANK_CLASSES = [
  "A","K","Q","J","T",
  "9","8","7","6","5","4","3","2"
];

export async function loadRankModel() {
  if (!rankModel) {
    rankModel = await tf.loadLayersModel("/models/rank/model.json");
    console.log("Rank model loaded");
  }
}

export async function predictRank(canvas: HTMLCanvasElement) {
  if (!rankModel) throw new Error("Rank model not loaded");

  const input = preprocessCorner(canvas);
  const output = rankModel.predict(input) as tf.Tensor;

  const probs = await output.data();
  const idx = probs.indexOf(Math.max(...probs));

  input.dispose();
  output.dispose();

  return {
    rank: RANK_CLASSES[idx],
    confidence: probs[idx],
  };
}