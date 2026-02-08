import { BiddingRule } from "../ruleTypes";

/**
 * SAYC responder continuations after Stayman replies
 */
export const saycStaymanContinuationRules: BiddingRule[] = [
  // Invite with no major fit
  {
    id: "SAYC_STAYMAN_CONT_2NT",
    bid: "2NT",
    phase: "response",
    priority: 80,
    forcing: false,
    conditions: {
      minHcp: 8,
      maxHcp: 9,
      position: "responder",
    },
    explanation:
      "Bid 2NT to invite game after Stayman when no major-suit fit is found.",
  },

  // Game without major fit
  {
    id: "SAYC_STAYMAN_CONT_3NT",
    bid: "3NT",
    phase: "response",
    priority: 70,
    forcing: false,
    conditions: {
      minHcp: 10,
      position: "responder",
    },
    explanation:
      "Bid 3NT to play game after Stayman when no major fit is available.",
  },

  // Raise hearts
  {
    id: "SAYC_STAYMAN_RAISE_3H",
    bid: "3H",
    phase: "response",
    priority: 90,
    forcing: false,
    conditions: {
      minSuitLength: { H: 4 },
      minHcp: 10,
      position: "responder",
    },
    explanation:
      "Raise to 3♥ with game-forcing values and a heart fit after Stayman.",
  },

  // Raise spades
  {
    id: "SAYC_STAYMAN_RAISE_3S",
    bid: "3S",
    phase: "response",
    priority: 90,
    forcing: false,
    conditions: {
      minSuitLength: { S: 4 },
      minHcp: 10,
      position: "responder",
    },
    explanation:
      "Raise to 3♠ with game-forcing values and a spade fit after Stayman.",
  },
];
