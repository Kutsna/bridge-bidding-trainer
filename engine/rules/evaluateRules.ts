import { BiddingRule } from "./ruleTypes";
import { HandFacts } from "../hand/handFacts";
import { AuctionState } from "../auction/auctionState";

/**
 * Check whether a single rule matches the current hand and auction state.
 */
export function ruleMatches(
  rule: BiddingRule,
  hand: HandFacts,
  auction: AuctionState,
): boolean {
  const c = rule.conditions;

  if (c.minHcp !== undefined && hand.hcp < c.minHcp) return false;
  if (c.maxHcp !== undefined && hand.hcp > c.maxHcp) return false;

  if (c.balanced !== undefined && hand.balanced !== c.balanced) return false;

  if (c.position !== undefined && auction.position !== c.position) return false;
  if (c.competition !== undefined && auction.competition !== c.competition)
    return false;
  if (c.strategy !== undefined && auction.strategy !== c.strategy) return false;

  if (c.minSuitLength) {
    for (const suit of Object.keys(c.minSuitLength)) {
      const minLen = c.minSuitLength[suit as keyof typeof c.minSuitLength];
      if (minLen !== undefined) {
        if (hand.suitLengths[suit as keyof typeof hand.suitLengths] < minLen) {
          return false;
        }
      }
    }
  }

  return true;
}

/**
 * Evaluate all rules and return the best matching one.
 */
export function evaluateRules(
  rules: BiddingRule[],
  hand: HandFacts,
  auction: AuctionState,
): BiddingRule | null {
  const matchingRules = rules.filter((rule) =>
    ruleMatches(rule, hand, auction),
  );

  if (matchingRules.length === 0) {
    return null;
  }

  matchingRules.sort((a, b) => b.priority - a.priority);

  return matchingRules[0];
}
