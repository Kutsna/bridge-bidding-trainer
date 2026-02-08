import { BiddingRule } from "../ruleTypes";

/**
 * SAYC opener replies to Stayman (after 1NT – 2♣)
 */
export const saycStaymanReplyRules: BiddingRule[] = [
  // 2♥ response: 4+ hearts
  {
    id: "SAYC_STAYMAN_REPLY_2H",
    bid: "2H",
    phase: "rebid",
    priority: 100,
    forcing: false,
    conditions: {
      minSuitLength: { H: 4 },
      position: "rebidder",
    },
    explanation:
      "Bid 2♥ to show a four-card heart suit after partner's Stayman inquiry.",
  },

  // 2♠ response: 4+ spades (no 4 hearts)
  {
    id: "SAYC_STAYMAN_REPLY_2S",
    bid: "2S",
    phase: "rebid",
    priority: 90,
    forcing: false,
    conditions: {
      minSuitLength: { S: 4 },
      position: "rebidder",
    },
    explanation:
      "Bid 2♠ to show a four-card spade suit when no four-card heart suit is held.",
  },

  // 2♦ denial: no four-card major
  {
    id: "SAYC_STAYMAN_REPLY_2D",
    bid: "2D",
    phase: "rebid",
    priority: 10,
    forcing: false,
    conditions: {
      position: "rebidder",
    },
    explanation: "Bid 2♦ to deny holding a four-card major after Stayman.",
  },
];
