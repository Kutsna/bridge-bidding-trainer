export type Suit = "S" | "H" | "D" | "C";

export interface Card {
  rank: string;
  suit: Suit;
}

export interface HandFacts {
  hcp: number;
  suitLengths: Record<Suit, number>;
  shape: string;
  balanced: boolean;
  longestSuit: Suit;
  secondSuit: Suit;
  hasFiveCardMajor: boolean;
  hasSixCardMajor: boolean;
  hasFourCardMajor: boolean;
  controls: number;
  isGameForcingStrength: boolean;
}

const HCP_VALUES: Record<string, number> = {
  A: 4,
  K: 3,
  Q: 2,
  J: 1
};

const CONTROL_VALUES: Record<string, number> = {
  A: 2,
  K: 1
};

export function computeHandFacts(hand: Card[]): HandFacts {

  const suitLengths: Record<Suit, number> = {
    S: 0,
    H: 0,
    D: 0,
    C: 0
  };

  let hcp = 0;
  let controls = 0;

  for (const card of hand) {
    suitLengths[card.suit]++;
    hcp += HCP_VALUES[card.rank] || 0;
    controls += CONTROL_VALUES[card.rank] || 0;
  }

  const sortedCounts = Object.values(suitLengths).sort((a,b) => b-a);
  const shape = sortedCounts.join("-");

  const balancedShapes = ["4-3-3-3", "4-4-3-2", "5-3-3-2"];
  const balanced = balancedShapes.includes(shape);

  const sortedSuits = Object.entries(suitLengths)
    .sort((a,b) => b[1] - a[1]);

  const longestSuit = sortedSuits[0][0] as Suit;
  const secondSuit = sortedSuits[1][0] as Suit;

  const hasFiveCardMajor =
    suitLengths.S >= 5 || suitLengths.H >= 5;

  const hasSixCardMajor =
    suitLengths.S >= 6 || suitLengths.H >= 6;

  const hasFourCardMajor =
    suitLengths.S >= 4 || suitLengths.H >= 4;

  const isGameForcingStrength = hcp >= 22;

  return {
    hcp,
    suitLengths,
    shape,
    balanced,
    longestSuit,
    secondSuit,
    hasFiveCardMajor,
    hasSixCardMajor,
    hasFourCardMajor,
    controls,
    isGameForcingStrength
  };
}