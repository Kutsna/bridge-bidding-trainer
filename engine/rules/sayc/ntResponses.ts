import { BiddingRule } from "../ruleTypes";

/**
 * SAYC responses to 1NT opening
 */
export const sayc1NTResponseRules: BiddingRule[] = [
  // Stayman 2♣
  {
    id: "SAYC_1NT_STAYMAN",
    bid: "2C",
    phase: "response",
    priority: 100,
    forcing: true,
    conditions: {
      minHcp: 8,
      position: "responder",
    },
    explanation:
      "Bid 2♣ (Stayman) to ask opener for a four-card major after a 1NT opening.",
  },

  // Jacoby transfer to hearts
  {
    id: "SAYC_1NT_JACOBY_H",
    bid: "2D",
    phase: "response",
    priority: 90,
    forcing: true,
    conditions: {
      minHcp: 5,
      minSuitLength: { H: 5 },
      position: "responder",
    },
    explanation: "Bid 2♦ as a Jacoby transfer to hearts after a 1NT opening.",
  },

  // Jacoby transfer to spades
  {
    id: "SAYC_1NT_JACOBY_S",
    bid: "2H",
    phase: "response",
    priority: 95,
    forcing: true,
    conditions: {
      minHcp: 5,
      minSuitLength: { S: 5 },
      position: "responder",
    },
    explanation: "Bid 2♥ as a Jacoby transfer to spades after a 1NT opening.",
  },

  // Simple raise to 2NT
  {
    id: "SAYC_1NT_2NT",
    bid: "2NT",
    phase: "response",
    priority: 70,
    forcing: false,
    conditions: {
      minHcp: 8,
      maxHcp: 9,
      position: "responder",
    },
    explanation: "Bid 2NT to invite game with 8–9 HCP after a 1NT opening.",
  },
];
