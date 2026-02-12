import * as tf from "@tensorflow/tfjs";

/**
 * Convert a corner canvas into a normalized tensor
 * Shape: [1, 32, 32, 1]
 */
export function preprocessCorner(
  canvas: HTMLCanvasElement,
  size = 32,
): tf.Tensor4D {
  return tf.tidy(() => {
    // 1 channel = grayscale
    const img = tf.browser.fromPixels(canvas, 1);

    // resize to model input
    const resized = tf.image.resizeBilinear(img, [size, size]);

    // normalize 0..1
    const normalized = resized.div(255);

    // add batch dimension
    return normalized.expandDims(0) as tf.Tensor4D;
  });
}
