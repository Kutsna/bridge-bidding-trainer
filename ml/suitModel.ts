import * as tf from "@tensorflow/tfjs";
import { preprocessCorner } from "./preprocess";

let suitModel: tf.LayersModel | null = null;

export const SUIT_CLASSES = ["S", "H", "D", "C"];

export async function loadSuitModel() {
  if (!suitModel) {
    suitModel = await tf.loadLayersModel("/models/suit/model.json");
    console.log("Suit model loaded");
  }
}

export async function predictSuit(canvas: HTMLCanvasElement) {
  if (!suitModel) throw new Error("Suit model not loaded");

  const input = preprocessCorner(canvas);
  const output = suitModel.predict(input) as tf.Tensor;

  const probs = await output.data();
  const idx = probs.indexOf(Math.max(...probs));

  input.dispose();
  output.dispose();

  return {
    suit: SUIT_CLASSES[idx],
    confidence: probs[idx],
  };
}
