import { HandFacts } from "../hand/handFacts";
import { classifyHand } from "../hand/classifyHand";

export interface BidRebidMatrix {
  opening: string;

  rebidAfterMajor: string;
  rebidAfter1NT: string;
  rebidAfter2C: string;
  rebidAfterTwoOverOne: string;

  continuationAfterResponderSecondBid: {
    afterSupport: string;
    afterNotrump: string;
    afterNewSuit: string;
    fallback: string;
  };

  explanation: string;
}

export function generateBidRebidMatrix(
  facts: HandFacts
): BidRebidMatrix {

  const type = classifyHand(facts);

  switch (type) {

    case "STRONG_2C":
      return {
        opening: "2C",
        rebidAfterMajor: "Show suit or 2NT (22-24 balanced)",
        rebidAfter1NT: "Show suit",
        rebidAfter2C: "Show suit or 2NT",
        rebidAfterTwoOverOne: "Game forcing structure",
        continuationAfterResponderSecondBid: {
          afterSupport: "Cue-bid controls or set trumps and drive to slam.",
          afterNotrump: "Describe controls and shape; continue game forcing.",
          afterNewSuit: "Support partner or show second suit with slam interest.",
          fallback: "Stay in forcing mode and keep describing shape/strength.",
        },
        explanation:
          "22+ HCP. Start with 2♣ and describe shape on second bid."
      };

    case "BALANCED_15_17":
      return {
        opening: "1NT",
        rebidAfterMajor: "—",
        rebidAfter1NT: "—",
        rebidAfter2C: "—",
        rebidAfterTwoOverOne: "—",
        continuationAfterResponderSecondBid: {
          afterSupport: "Raise with fit and accept/decline invitational strength.",
          afterNotrump: "Accept invitation with max, otherwise sign off.",
          afterNewSuit: "Treat as natural/invitational and place the contract.",
          fallback: "Use notrump structure to place the final contract.",
        },
        explanation:
          "15–17 balanced. 1NT fully describes the hand."
      };

    case "BALANCED_18_19":
      return {
        opening: facts.suitLengths.D >= facts.suitLengths.C ? "1D" : "1C",
        rebidAfterMajor: "2NT (18–19 balanced)",
        rebidAfter1NT: "2NT",
        rebidAfter2C: "2NT",
        rebidAfterTwoOverOne: "3NT",
        continuationAfterResponderSecondBid: {
          afterSupport: "With fit, invite or bid game depending on responder strength.",
          afterNotrump: "Bid 3NT unless responder shows slam interest.",
          afterNewSuit: "Clarify support/notrump and place game.",
          fallback: "Keep auction descriptive and aim for game.",
        },
        explanation:
          "18–19 balanced. Open minor then rebid 2NT."
      };

    case "ONE_SUITED_MAJOR":
      const major = facts.suitLengths.S >= 6 ? "S" : "H";
      return {
        opening: `1${major}`,
        rebidAfterMajor: `3${major}`,
        rebidAfter1NT: `3${major}`,
        rebidAfter2C: `3${major}`,
        rebidAfterTwoOverOne: `3${major}`,
        continuationAfterResponderSecondBid: {
          afterSupport: `With fit confirmed, evaluate game/slam and continue naturally.`,
          afterNotrump: `Re-show ${major} length only with extra shape; otherwise place contract.`,
          afterNewSuit: `Prefer supporting partner with fit, else re-describe hand.`,
          fallback: "Continue by strength and fit; avoid under-describing the long major.",
        },
        explanation:
          "16+ HCP with 6-card major. Plan jump rebid to show strength."
      };

    case "ONE_SUITED_MINOR":
      const minor = facts.suitLengths.D >= 6 ? "D" : "C";
      return {
        opening: `1${minor}`,
        rebidAfterMajor: `3${minor}`,
        rebidAfter1NT: `3${minor}`,
        rebidAfter2C: `3${minor}`,
        rebidAfterTwoOverOne: `3${minor}`,
        continuationAfterResponderSecondBid: {
          afterSupport: `Fit in ${minor} is known; evaluate game/slam and continue naturally.`,
          afterNotrump: `Place contract in 3NT/5${minor} based on stoppers and combined values.`,
          afterNewSuit: `Support responder with fit, otherwise keep showing long ${minor}.`,
          fallback: `Keep showing long ${minor} and place the best game-level contract.`,
        },
        explanation:
          "16–18 HCP with 6+ minor. Plan jump rebid to show strength."
      };

    case "MINIMUM_OPENING":
      const suit = facts.longestSuit;
      return {
        opening: `1${suit}`,
        rebidAfterMajor: `2${suit}`,
        rebidAfter1NT: `2${suit}`,
        rebidAfter2C: `2${suit}`,
        rebidAfterTwoOverOne: "Support or show second suit",
        continuationAfterResponderSecondBid: {
          afterSupport: "Compete to the safe level with minimum values.",
          afterNotrump: "Prefer partscore unless distribution suggests extra tricks.",
          afterNewSuit: "Show support or second suit at minimum level.",
          fallback: "Keep bids low and descriptive with minimum opening values.",
        },
        explanation:
          "12–15 HCP. Minimum opening; simple rebid of suit."
      };

    default:
      return {
        opening: "Pass",
        rebidAfterMajor: "—",
        rebidAfter1NT: "—",
        rebidAfter2C: "—",
        rebidAfterTwoOverOne: "—",
        continuationAfterResponderSecondBid: {
          afterSupport: "—",
          afterNotrump: "—",
          afterNewSuit: "—",
          fallback: "No active bid-rebid couple for this hand type.",
        },
        explanation: "Not enough strength to open."
      };
  }
}
