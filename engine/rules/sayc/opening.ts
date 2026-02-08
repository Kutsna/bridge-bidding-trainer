import { BiddingRule } from "../ruleTypes";

/**
 * SAYC Opening Bids (non-competitive, basic version)
 */
export const saycOpeningRules: BiddingRule[] = [
  // 1NT opening
  {
    id: "SAYC_OPEN_1NT",
    bid: "1NT",
    phase: "opening",
    priority: 100,
    forcing: false,
    conditions: {
      minHcp: 15,
      maxHcp: 17,
      balanced: true,
      position: "opener",
      competition: "none",
    },
    explanation: "Open 1NT with 15–17 HCP and a balanced hand.",
  },

  // 1♠ opening
  {
    id: "SAYC_OPEN_1S",
    bid: "1S",
    phase: "opening",
    priority: 90,
    forcing: false,
    conditions: {
      minHcp: 12,
      minSuitLength: { S: 5 },
      position: "opener",
      competition: "none",
    },
    explanation: "Open 1♠ with 12–21 HCP and at least five spades.",
  },

  // 1♥ opening
  {
    id: "SAYC_OPEN_1H",
    bid: "1H",
    phase: "opening",
    priority: 85,
    forcing: false,
    conditions: {
      minHcp: 12,
      minSuitLength: { H: 5 },
      position: "opener",
      competition: "none",
    },
    explanation: "Open 1♥ with 12–21 HCP and at least five hearts.",
  },

  // 1♦ opening
  {
    id: "SAYC_OPEN_1D",
    bid: "1D",
    phase: "opening",
    priority: 80,
    forcing: false,
    conditions: {
      minHcp: 12,
      minSuitLength: { D: 3 },
      position: "opener",
      competition: "none",
    },
    explanation:
      "Open 1♦ with 12–21 HCP and at least three diamonds when no five-card major is available.",
  },

  // 1♣ opening
  {
    id: "SAYC_OPEN_1C",
    bid: "1C",
    phase: "opening",
    priority: 75,
    forcing: false,
    conditions: {
      minHcp: 12,
      minSuitLength: { C: 3 },
      position: "opener",
      competition: "none",
    },
    explanation: "Open 1♣ with 12–21 HCP when no other opening bid applies.",
  },

  // Pass (insufficient values)
  {
    id: "SAYC_OPEN_PASS",
    bid: "P",
    phase: "opening",
    priority: 10,
    forcing: false,
    conditions: {
      maxHcp: 11,
      position: "opener",
      competition: "none",
    },
    explanation: "Pass with fewer than 12 high card points.",
  },
  // Strong 2♣ opening (artificial, forcing)
  {
    id: "SAYC_OPEN_2C_STRONG",
    bid: "2C",
    phase: "opening",
    priority: 110,
    forcing: true,
    conditions: {
      minHcp: 22,
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 2♣ to show 22+ HCP or equivalent playing strength."
  },
  // Weak 2♦ opening
  {
    id: "SAYC_OPEN_2D_WEAK",
    bid: "2D",
    phase: "opening",
    priority: 60,
    forcing: false,
    conditions: {
      minHcp: 6,
      maxHcp: 10,
      minSuitLength: { D: 6 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 2♦ as a weak two with a six-card diamond suit and 6–10 HCP."
  },

  // Weak 2♥ opening
  {
    id: "SAYC_OPEN_2H_WEAK",
    bid: "2H",
    phase: "opening",
    priority: 65,
    forcing: false,
    conditions: {
      minHcp: 6,
      maxHcp: 10,
      minSuitLength: { H: 6 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 2♥ as a weak two with a six-card heart suit and 6–10 HCP."
  },

  // Weak 2♠ opening
  {
    id: "SAYC_OPEN_2S_WEAK",
    bid: "2S",
    phase: "opening",
    priority: 70,
    forcing: false,
    conditions: {
      minHcp: 6,
      maxHcp: 10,
      minSuitLength: { S: 6 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 2♠ as a weak two with a six-card spade suit and 6–10 HCP."
  },
  // 3-level preempt openings
  {
    id: "SAYC_OPEN_3D_PREEMPT",
    bid: "3D",
    phase: "opening",
    priority: 40,
    forcing: false,
    conditions: {
      minHcp: 0,
      maxHcp: 9,
      minSuitLength: { D: 7 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 3♦ as a preempt with a long diamond suit and limited high card strength."
  },

  {
    id: "SAYC_OPEN_3H_PREEMPT",
    bid: "3H",
    phase: "opening",
    priority: 45,
    forcing: false,
    conditions: {
      minHcp: 0,
      maxHcp: 9,
      minSuitLength: { H: 7 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 3♥ as a preempt with a long heart suit and limited strength."
  },

  {
    id: "SAYC_OPEN_3S_PREEMPT",
    bid: "3S",
    phase: "opening",
    priority: 50,
    forcing: false,
    conditions: {
      minHcp: 0,
      maxHcp: 9,
      minSuitLength: { S: 7 },
      position: "opener",
      competition: "none"
    },
    explanation:
      "Open 3♠ as a preempt with a long spade suit and limited strength."
  },
];
