import { Card, Suit } from "../../shared/types";

export interface HandFacts {
  hcp: number;
  suitLengths: Record<Suit, number>;
  shape: string;
  balanced: boolean;
}

const HCP_VALUES: Record<string, number> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1,
};

export function computeHandFacts(hand: Card[]): HandFacts {
  if (hand.length !== 13) {
    throw new Error("A bridge hand must contain exactly 13 cards.");
  }

  const suitLengths: Record<Suit, number> = {
    S: 0,
    H: 0,
    D: 0,
    C: 0,
  };

  let hcp = 0;

  for (const card of hand) {
    suitLengths[card.suit]++;
    hcp += HCP_VALUES[card.rank] || 0;
  }

  const lengths = Object.values(suitLengths).sort((a, b) => b - a);
  const shape = lengths.join("-");

  const balanced =
    shape === "4-3-3-3" || shape === "4-4-3-2" || shape === "5-3-3-2";

  return {
    hcp,
    suitLengths,
    shape,
    balanced,
  };
}
