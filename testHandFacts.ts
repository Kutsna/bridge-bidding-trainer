import { computeHandFacts } from "./engine/hand/handFacts.ts";

const testHand = [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "K" },
  { suit: "S", rank: "Q" },
  { suit: "S", rank: "7" },
  { suit: "S", rank: "3" },

  { suit: "H", rank: "A" },
  { suit: "H", rank: "5" },
  { suit: "H", rank: "2" },

  { suit: "D", rank: "K" },
  { suit: "D", rank: "8" },
  { suit: "D", rank: "4" },

  { suit: "C", rank: "9" },
  { suit: "C", rank: "2" }
];

const facts = computeHandFacts(testHand);

console.log("Hand facts:", facts);