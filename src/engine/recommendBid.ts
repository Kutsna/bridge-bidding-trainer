import { HandFacts } from "./hand/handFacts";
import { AuctionState } from "./auction/auctionState";
import { BiddingRule } from "./rules/ruleTypes";
import { evaluateRules } from "./rules/evaluateRules";

export interface BidRecommendation {
  bid: string;
  explanation: string;
  ruleId: string;
}

export function recommendBid(
  rules: BiddingRule[],
  hand: HandFacts,
  auction: AuctionState,
): BidRecommendation | null {

  const isOpening = auction.auction.length === 0;

  if (isOpening) {

    // You MUST adjust these two lines to match your HandFacts shape
    const spadeLength = (hand as any).shape?.S ?? (hand as any).suits?.S ?? 0;
    const heartLength = (hand as any).shape?.H ?? (hand as any).suits?.H ?? 0;

    const hasFiveSpades = spadeLength >= 5;
    const hasFiveHearts = heartLength >= 5;

    // 1️⃣ PRIORITY: 5-card majors (modern style)
    if (hand.hcp >= 12 && hand.hcp <= 21) {

      if (hasFiveSpades) {
        const rule = rules.find(r => r.bid === "1S");
        if (rule) {
          return {
            bid: rule.bid,
            explanation: rule.explanation,
            ruleId: rule.id,
          };
        }
      }

      if (hasFiveHearts) {
        const rule = rules.find(r => r.bid === "1H");
        if (rule) {
          return {
            bid: rule.bid,
            explanation: rule.explanation,
            ruleId: rule.id,
          };
        }
      }
    }

    // 2️⃣ THEN 1NT (only if no 5-card major)
    if (
      hand.hcp >= 15 &&
      hand.hcp <= 17 &&
      hand.balanced &&
      !hasFiveSpades &&
      !hasFiveHearts
    ) {
      const rule = rules.find(r => r.bid === "1NT");
      if (rule) {
        return {
          bid: rule.bid,
          explanation: rule.explanation,
          ruleId: rule.id,
        };
      }
    }
  }

  // 3️⃣ Normal rule engine fallback
  const rule = evaluateRules(rules, hand, auction);

  if (!rule) return null;

  return {
    bid: rule.bid,
    explanation: rule.explanation,
    ruleId: rule.id,
  };
}
