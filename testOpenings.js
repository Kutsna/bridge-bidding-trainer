import { computeHandFacts } from "./engine/hand/handFacts.ts";
import { recommendBid } from "./engine/recommendBid.ts";
import { saycOpeningRules } from "./engine/rules/sayc/opening.ts";

// Helper to run a test
function testHand(name, hand) {
  const facts = computeHandFacts(hand);

  const auction = {
    auction: [],
    position: "opener",
    forcing: false,
    system: "SAYC",
    strategy: "THOROUGH",
    competition: "none",
  };

  const result = recommendBid(saycOpeningRules, facts, auction);

  console.log("----", name, "----");
  console.log("HCP:", facts.hcp, "Shape:", facts.shape);
  console.log("Recommended:", result);
  console.log();
}

// 1️⃣ Strong 2♣ hand (22+ HCP)
testHand("Strong 2C", [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "K" },
  { suit: "S", rank: "Q" },
  { suit: "H", rank: "A" },
  { suit: "H", rank: "K" },
  { suit: "H", rank: "Q" },
  { suit: "D", rank: "A" },
  { suit: "D", rank: "K" },
  { suit: "C", rank: "A" },
  { suit: "C", rank: "K" },
  { suit: "C", rank: "2" },
  { suit: "D", rank: "2" },
  { suit: "H", rank: "2" },
]);

// 2️⃣ 1NT opening (15–17 balanced)
testHand("1NT", [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "K" },
  { suit: "S", rank: "7" },
  { suit: "S", rank: "3" },

  { suit: "H", rank: "Q" },
  { suit: "H", rank: "J" },
  { suit: "H", rank: "5" },

  { suit: "D", rank: "A" },
  { suit: "D", rank: "4" },
  { suit: "D", rank: "3" },

  { suit: "C", rank: "K" },
  { suit: "C", rank: "8" },
  { suit: "C", rank: "2" },
]);

// 3️⃣ 1♠ opening
testHand("1S", [
  { suit: "S", rank: "A" },
  { suit: "S", rank: "K" },
  { suit: "S", rank: "Q" },
  { suit: "S", rank: "9" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "K" },
  { suit: "H", rank: "7" },
  { suit: "H", rank: "2" },

  { suit: "D", rank: "Q" },
  { suit: "D", rank: "5" },

  { suit: "C", rank: "8" },
  { suit: "C", rank: "3" },
  { suit: "C", rank: "2" },
]);

// 4️⃣ Weak 2♥
testHand("Weak 2H", [
  { suit: "H", rank: "K" },
  { suit: "H", rank: "Q" },
  { suit: "H", rank: "J" },
  { suit: "H", rank: "9" },
  { suit: "H", rank: "8" },
  { suit: "H", rank: "4" },

  { suit: "S", rank: "9" },
  { suit: "S", rank: "4" },

  { suit: "D", rank: "8" },
  { suit: "D", rank: "3" },

  { suit: "C", rank: "7" },
  { suit: "C", rank: "5" },
  { suit: "C", rank: "2" },
]);

// 5️⃣ 3♠ preempt
testHand("3S preempt", [
  { suit: "S", rank: "K" },
  { suit: "S", rank: "Q" },
  { suit: "S", rank: "J" },
  { suit: "S", rank: "9" },
  { suit: "S", rank: "8" },
  { suit: "S", rank: "7" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "5" },
  { suit: "H", rank: "3" },

  { suit: "D", rank: "8" },
  { suit: "D", rank: "2" },

  { suit: "C", rank: "6" },
  { suit: "C", rank: "3" },
]);

// 6️⃣ Pass
testHand("Pass", [
  { suit: "S", rank: "9" },
  { suit: "S", rank: "7" },
  { suit: "S", rank: "4" },

  { suit: "H", rank: "8" },
  { suit: "H", rank: "6" },
  { suit: "H", rank: "3" },

  { suit: "D", rank: "9" },
  { suit: "D", rank: "5" },
  { suit: "D", rank: "2" },

  { suit: "C", rank: "J" },
  { suit: "C", rank: "8" },
  { suit: "C", rank: "4" },
  { suit: "C", rank: "2" },
]);
