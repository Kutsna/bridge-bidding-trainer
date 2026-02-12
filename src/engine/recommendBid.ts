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
  const rule = evaluateRules(rules, hand, auction);

  if (!rule) {
    return null;
  }

  return {
    bid: rule.bid,
    explanation: rule.explanation,
    ruleId: rule.id,
  };
}
