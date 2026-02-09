import { BiddingRule } from "../ruleTypes";

/**
 * SAYC opener replies to Jacoby transfers after 1NT,2D
 */
export const saycJacobyReplyRules: BiddingRule[] = [
  // Accept transfer to hearts
  {
    id: "SAYC_JACOBY_REPLY_2H",
    bid: "2H",
    phase: "rebid",
    priority: 100,
    forcing: false,
    conditions: {
      auctionPattern: ["1NT", "2D"],
      position: "rebidder",
    },
    explanation:
      "Bid 2♥ to accept partner’s Jacoby(2D) transfer to hearts after a 1NT opening.",
  },

  // Accept transfer to spades
  {
    id: "SAYC_JACOBY_REPLY_2S",
    bid: "2S",
    phase: "rebid",
    priority: 100,
    forcing: false,
    conditions: {
      auctionPattern: ["1NT", "2H"],
      position: "rebidder",
    },
    explanation:
      "Bid 2♠ to accept partner’s Jacoby(2H) transfer to spades after a 1NT opening.",
  },
];
