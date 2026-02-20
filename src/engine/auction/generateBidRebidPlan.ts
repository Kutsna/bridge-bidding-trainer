import { HandFacts } from "../hand/handFacts";

export interface BidRebidPlan {
  opening: string;
  rebidAfterMajor: string;
  rebidAfter1NT: string;
  rebidAfter2C: string;
  explanation: string;
}

export function generateBidRebidPlan(facts: HandFacts): BidRebidPlan {

  // Strong 1-suited minor (16–18 HCP, 6+ suit)
  if (
    facts.hcp >= 16 &&
    facts.hcp <= 18 &&
    facts.suitLengths.D >= 6
  ) {
    return {
      opening: "1D",
      rebidAfterMajor: "3D",
      rebidAfter1NT: "3D",
      rebidAfter2C: "3D",
      explanation:
        "Strong one-suited diamond hand (16–18 HCP, 6+ diamonds). Plan to jump-rebid 3♦ to show strength regardless of responder's first bid."
    };
  }

  // Balanced 15–17
  if (facts.balanced && facts.hcp >= 15 && facts.hcp <= 17) {
    return {
      opening: "1NT",
      rebidAfterMajor: "—",
      rebidAfter1NT: "—",
      rebidAfter2C: "—",
      explanation: "15–17 balanced. 1NT describes hand immediately."
    };
  }

  // Default
  return {
    opening: "1D",
    rebidAfterMajor: "2D",
    rebidAfter1NT: "2D",
    rebidAfter2C: "2D",
    explanation: "Standard minimum rebid."
  };
}
