import { Card } from "../../shared/types";

export type CardInputSource =
  | { type: "manual"; cards: Card[] }
  | { type: "camera"; imageData: ImageData };

export interface CardRecognizer {
  recognize(input: CardInputSource): Promise<Card[]>;
}
