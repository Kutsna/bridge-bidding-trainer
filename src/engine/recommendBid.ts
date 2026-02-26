import { computeHandFacts } from "./hand/handFacts";
import { generateBidRebidMatrix } from "./auction/generateBidRebidMatrix";

export function recommendBid(hand: any[]) {

  const facts = computeHandFacts(hand);

  const matrix = generateBidRebidMatrix(facts);

  return {
    facts,
    matrix
  };
}

type AuctionBidInput = string | { bid?: string };

function normalizeBid(input: AuctionBidInput): string {
  if (typeof input === "string") return input.trim().toUpperCase();
  return String(input?.bid ?? "").trim().toUpperCase();
}

function isCallBid(bid: string): boolean {
  return bid.length > 0 && bid !== "P" && bid !== "X" && bid !== "XX";
}

function hasDiamondSpadeReverseValues(
  opening: string,
  facts: ReturnType<typeof computeHandFacts>,
): boolean {
  return opening === "1D" && facts.suitLengths.S >= 4 && facts.hcp >= 16 && facts.hcp <= 21;
}

function getSpadeHeartRebid(
  opening: string,
  facts: ReturnType<typeof computeHandFacts>,
): string | null {
  if (opening !== "1S") return null;
  if (facts.suitLengths.S < 5 || facts.suitLengths.H < 4) return null;
  if (facts.hcp >= 12 && facts.hcp <= 18) return "2H";
  if (facts.hcp >= 19 && facts.hcp <= 21) return "3H";
  return null;
}

function getHeartSpadeReverseRebid(
  opening: string,
  responderBid: string,
  facts: ReturnType<typeof computeHandFacts>,
): string | null {
  if (opening !== "1H") return null;
  if (responderBid !== "2C" && responderBid !== "2D") return null;

  const hasReverseShape = facts.suitLengths.H >= 5 && facts.suitLengths.S >= 4;
  if (hasReverseShape && facts.hcp >= 16 && facts.hcp <= 21) {
    return "2S";
  }

  if (facts.hcp < 12 || facts.hcp > 15) return null;

  if (responderBid === "2C" && facts.suitLengths.C >= 4) return "3C";
  if (responderBid === "2D" && facts.suitLengths.D >= 4) return "3D";

  return "2NT";
}

function isNaturalBid(bid: string): boolean {
  return /^[1-7](C|D|H|S|NT)$/.test(bid);
}

function canBidSuitAtOneLevelAfterResponse(
  opening: string,
  responderBid: string,
  rebidSuit: "H" | "S",
): boolean {
  if (!/^1[CDHS]$/.test(opening) || !/^1[CDHS]$/.test(responderBid)) return false;

  const responderSuit = responderBid.slice(-1) as "C" | "D" | "H" | "S";
  const suitRank = { C: 1, D: 2, H: 3, S: 4 } as const;
  return suitRank[rebidSuit] > suitRank[responderSuit];
}

function mapResponderFirstAnswerToRebid(
  responderBid: string,
  opening: string,
  facts: ReturnType<typeof computeHandFacts>,
  matrix: ReturnType<typeof generateBidRebidMatrix>,
): string {
  if (responderBid === "1H" || responderBid === "1S") {
    if (opening === "1C" || opening === "1D") {
      const otherMajor = responderBid === "1H" ? "S" : "H";
      const hasOtherMajorLength = facts.suitLengths[otherMajor] >= 4;

      if (
        hasOtherMajorLength &&
        canBidSuitAtOneLevelAfterResponse(opening, responderBid, otherMajor)
      ) {
        return `1${otherMajor}`;
      }
    }

    const responderMajor = responderBid.slice(-1) as "H" | "S";
    const openingSuit = opening.endsWith("NT") ? "NT" : opening.slice(-1);
    const validNaturalOpeningSuit = ["C", "D", "H", "S"].includes(openingSuit);
    const hasFourCardSupport = facts.suitLengths[responderMajor] >= 4;

    if (responderBid === "1H" && hasDiamondSpadeReverseValues(opening, facts)) {
      return "2S";
    }

    if (
      validNaturalOpeningSuit &&
      openingSuit !== responderMajor &&
      hasFourCardSupport &&
      facts.hcp >= 16 &&
      facts.hcp <= 21
    ) {
      return `3${responderMajor}`;
    }

    if (
      validNaturalOpeningSuit &&
      openingSuit !== responderMajor &&
      hasFourCardSupport &&
      facts.hcp >= 12 &&
      facts.hcp <= 15
    ) {
      return `2${responderMajor}`;
    }

    return matrix.rebidAfterMajor;
  }
  if (responderBid === "1NT") {
    if (hasDiamondSpadeReverseValues(opening, facts)) {
      return "2S";
    }
    return matrix.rebidAfter1NT;
  }
  if (responderBid === "2C") {
    const heartSpadeReverse = getHeartSpadeReverseRebid(opening, responderBid, facts);
    if (heartSpadeReverse) {
      return heartSpadeReverse;
    }
    const spadeHeartRebid = getSpadeHeartRebid(opening, facts);
    if (spadeHeartRebid) {
      return spadeHeartRebid;
    }
    if (hasDiamondSpadeReverseValues(opening, facts)) {
      return "2S";
    }
    return matrix.rebidAfter2C;
  }
  if (responderBid === "2D") {
    const heartSpadeReverse = getHeartSpadeReverseRebid(opening, responderBid, facts);
    if (heartSpadeReverse) {
      return heartSpadeReverse;
    }
    const spadeHeartRebid = getSpadeHeartRebid(opening, facts);
    if (spadeHeartRebid) {
      return spadeHeartRebid;
    }
    if (hasDiamondSpadeReverseValues(opening, facts)) {
      return "2S";
    }
    return matrix.rebidAfterTwoOverOne;
  }
  if (/^2[DHSC]$/.test(responderBid)) return matrix.rebidAfterTwoOverOne;
  return matrix.rebidAfterTwoOverOne;
}

function mapResponderSecondAnswerToContinuation(
  responderFirstAnswer: string,
  responderSecondBid: string,
  opening: string,
  facts: ReturnType<typeof computeHandFacts>,
  matrix: ReturnType<typeof generateBidRebidMatrix>,
): string {
  if (
    hasDiamondSpadeReverseValues(opening, facts) &&
    responderFirstAnswer === "1H" &&
    responderSecondBid === "2H"
  ) {
    return "2S";
  }

  const openingSuit = opening.endsWith("NT") ? "NT" : opening.slice(-1);

  if (responderSecondBid.endsWith("NT")) {
    return matrix.continuationAfterResponderSecondBid.afterNotrump;
  }

  const responderSuit = responderSecondBid.slice(-1);
  if (openingSuit !== "NT" && responderSuit === openingSuit) {
    return matrix.continuationAfterResponderSecondBid.afterSupport;
  }

  if (/^[1-7][CDHS]$/.test(responderSecondBid)) {
    return matrix.continuationAfterResponderSecondBid.afterNewSuit;
  }

  return matrix.continuationAfterResponderSecondBid.fallback;
}

export function recommendBidFromAuction(
  hand: any[],
  auction: AuctionBidInput[],
) {
  const facts = computeHandFacts(hand);
  const matrix = generateBidRebidMatrix(facts);
  const rebidAfter1H = mapResponderFirstAnswerToRebid("1H", matrix.opening, facts, matrix);
  const rebidAfter1S = mapResponderFirstAnswerToRebid("1S", matrix.opening, facts, matrix);
  const rebidAfter1NT = mapResponderFirstAnswerToRebid("1NT", matrix.opening, facts, matrix);
  const rebidAfter2C = mapResponderFirstAnswerToRebid("2C", matrix.opening, facts, matrix);
  const after1MajorDisplay =
    rebidAfter1H === rebidAfter1S
      ? rebidAfter1H
      : `1H→${rebidAfter1H}, 1S→${rebidAfter1S}`;

  const calls = auction.map(normalizeBid).filter(isCallBid);

  if (calls.length === 0) {
    return {
      facts,
      matrix,
      couplePlan: {
        opening: matrix.opening,
        after1Major: after1MajorDisplay,
        after1NT: rebidAfter1NT,
        after2C: rebidAfter2C,
      },
      phase: "opening",
      recommendedBid: matrix.opening,
      explanation: `Opening plan: ${matrix.opening}. ${matrix.explanation}`,
    };
  }

  if (calls.length >= 2) {
    const responderFirstAnswer = calls[1];
    let openerRebid = mapResponderFirstAnswerToRebid(
      responderFirstAnswer,
      matrix.opening,
      facts,
      matrix,
    );

    const hasInterferenceBeforeOurRebid =
      calls.length >= 3 && isNaturalBid(calls[2]);

    const isMinRangeHeartReverseNoFitNTPlan =
      matrix.opening === "1H" &&
      (responderFirstAnswer === "2C" || responderFirstAnswer === "2D") &&
      facts.hcp >= 12 &&
      facts.hcp <= 15 &&
      openerRebid === "2NT";

    if (isMinRangeHeartReverseNoFitNTPlan && hasInterferenceBeforeOurRebid) {
      openerRebid = facts.hcp >= 14 ? "X" : "P";
    }

    if (calls.length === 2) {
      return {
        facts,
        matrix,
        couplePlan: {
          opening: matrix.opening,
          after1Major: after1MajorDisplay,
          after1NT: rebidAfter1NT,
          after2C: rebidAfter2C,
        },
        phase: "opener-rebid-after-first-response",
        recommendedBid: openerRebid,
        explanation:
          `Bid-rebid couple: open ${matrix.opening}, then after responder ${responderFirstAnswer} rebid ${openerRebid}.`,
      };
    }

    if (calls.length >= 4) {
      const responderSecondAnswer = calls[3];
      const continuation = mapResponderSecondAnswerToContinuation(
        responderFirstAnswer,
        responderSecondAnswer,
        matrix.opening,
        facts,
        matrix,
      );

      return {
        facts,
        matrix,
        couplePlan: {
          opening: matrix.opening,
          after1Major: after1MajorDisplay,
          after1NT: rebidAfter1NT,
          after2C: rebidAfter2C,
        },
        phase: "opener-action-after-second-response",
        recommendedBid: continuation,
        explanation:
          `After opener ${matrix.opening}, responder ${responderFirstAnswer}, opener ${openerRebid}, responder ${responderSecondAnswer}: ${continuation}`,
      };
    }

    return {
      facts,
      matrix,
      couplePlan: {
        opening: matrix.opening,
        after1Major: after1MajorDisplay,
          after1NT: rebidAfter1NT,
          after2C: rebidAfter2C,
      },
      phase: "planned-rebid",
      recommendedBid: openerRebid,
      explanation:
        `Planned opener rebid remains ${openerRebid} after responder ${responderFirstAnswer}.`,
    };
  }

  return {
    facts,
    matrix,
    couplePlan: {
      opening: matrix.opening,
      after1Major: after1MajorDisplay,
      after1NT: rebidAfter1NT,
      after2C: rebidAfter2C,
    },
    phase: "opening",
    recommendedBid: matrix.opening,
    explanation: `Opening plan: ${matrix.opening}. ${matrix.explanation}`,
  };
}
