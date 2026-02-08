import { computeHandFacts } from "../engine/hand/handFacts.ts";
import { recommendBid } from "../engine/recommendBid.ts";
import { derivePosition } from "../engine/auction/derivePosition.ts";

import { saycOpeningRules } from "../engine/rules/sayc/opening.ts";
import { sayc1NTResponseRules } from "../engine/rules/sayc/ntResponses.ts";
import { saycStaymanReplyRules } from "../engine/rules/sayc/staymanReplies.ts";

// ---- SAMPLE HAND (change later) ----
const hand = [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "K" },
  { suit: "S", rank: "7" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "Q" },
  { suit: "H", rank: "J" },
  { suit: "H", rank: "6" },
  { suit: "H", rank: "2" },

  { suit: "D", rank: "A" },
  { suit: "D", rank: "8" },
  { suit: "D", rank: "3" },

  { suit: "C", rank: "9" },
  { suit: "C", rank: "5" },
];

// ---- AUCTION ----
// Example: 1NT – 2♣ (Stayman)
const auction = ["1NT", "2C"];

const auctionState = {
  auction,
  position: derivePosition(auction),
  forcing: false,
  system: "SAYC",
  strategy: "THOROUGH",
  competition: "none",
};

const handFacts = computeHandFacts(hand);

// Combine all rules
const rules = [
  ...saycOpeningRules,
  ...sayc1NTResponseRules,
  ...saycStaymanReplyRules,
];

// Ask engine for recommendation
const recommendation = recommendBid(rules, handFacts, auctionState);

console.log("Auction:", auction.join(" – "));
console.log("Hand facts:", handFacts);
console.log("Recommended bid:", recommendation);
