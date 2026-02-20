import { HandFacts } from "./handFacts";

export type HandType =
  | "STRONG_2C"
  | "BALANCED_15_17"
  | "BALANCED_18_19"
  | "ONE_SUITED_MAJOR"
  | "ONE_SUITED_MINOR"
  | "TWO_SUITED"
  | "MINIMUM_OPENING"
  | "WEAK";

export function classifyHand(facts: HandFacts): HandType {

  if (facts.hcp >= 22) return "STRONG_2C";

  if (facts.balanced && facts.hcp >= 15 && facts.hcp <= 17)
    return "BALANCED_15_17";

  if (facts.balanced && facts.hcp >= 18 && facts.hcp <= 19)
    return "BALANCED_18_19";

  if (facts.hcp >= 16 && facts.hasSixCardMajor)
    return "ONE_SUITED_MAJOR";

  if (facts.hcp >= 16 && facts.suitLengths.D >= 6)
    return "ONE_SUITED_MINOR";

  if (facts.hcp >= 12 && facts.longestSuit !== facts.secondSuit)
    return "MINIMUM_OPENING";

  return "WEAK";
}
