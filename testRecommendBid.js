import { computeHandFacts } from "./engine/hand/handFacts.ts";
import { recommendBid } from "./engine/recommendBid.ts";
import { saycOpeningRules } from "./engine/rules/sayc/opening.ts";

// -------------------------
// TEST HAND 1: 1NT opening
// -------------------------
const hand1 = [
  { suit: "S", rank: "K" },
  { suit: "S", rank: "9" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "A" },
  { suit: "H", rank: "Q" },
  { suit: "H", rank: "7" },

  { suit: "D", rank: "K" },
  { suit: "D", rank: "J" },
  { suit: "D", rank: "3" },

  { suit: "C", rank: "Q" },
  { suit: "C", rank: "8" },
  { suit: "C", rank: "5" },
  { suit: "C", rank: "2" },
];

const auctionOpening = {
  auction: [],
  position: "opener",
  forcing: false,
  system: "SAYC",
  strategy: "FAST",
  competition: "none",
};

const facts1 = computeHandFacts(hand1);
const rec1 = recommendBid(saycOpeningRules, facts1, auctionOpening);

console.log("TEST 1 (Expect 1NT):", rec1);

// -------------------------
// TEST HAND 2: 1♠ opening
// -------------------------
const hand2 = [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "Q" },
  { suit: "S", rank: "J" },
  { suit: "S", rank: "8" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "K" },
  { suit: "H", rank: "7" },
  { suit: "H", rank: "3" },

  { suit: "D", rank: "Q" },
  { suit: "D", rank: "9" },
  { suit: "D", rank: "5" },

  { suit: "C", rank: "8" },
  { suit: "C", rank: "2" },
];

const facts2 = computeHandFacts(hand2);
const rec2 = recommendBid(saycOpeningRules, facts2, auctionOpening);

console.log("TEST 2 (Expect 1S):", rec2);

// -------------------------
// TEST HAND 3: Pass
// -------------------------
const hand3 = [
  { suit: "S", rank: "9" },
  { suit: "S", rank: "6" },
  { suit: "S", rank: "3" },

  { suit: "H", rank: "8" },
  { suit: "H", rank: "6" },
  { suit: "H", rank: "4" },

  { suit: "D", rank: "Q" },
  { suit: "D", rank: "7" },
  { suit: "D", rank: "5" },

  { suit: "C", rank: "J" },
  { suit: "C", rank: "9" },
  { suit: "C", rank: "4" },
  { suit: "C", rank: "2" },
];

const facts3 = computeHandFacts(hand3);
const rec3 = recommendBid(saycOpeningRules, facts3, auctionOpening);

console.log("TEST 3 (Expect Pass):", rec3);
