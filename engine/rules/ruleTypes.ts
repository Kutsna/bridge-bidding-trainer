import { HandFacts } from "../hand/handFacts";
import { AuctionState } from "../auction/auctionState";

/**
 * Conditions that must be satisfied for a rule to apply.
 * All specified conditions must be true.
 */
export interface RuleCondition {
  minHcp?: number;
  maxHcp?: number;

  minSuitLength?: Partial<Record<"S" | "H" | "D" | "C", number>>;

  balanced?: boolean;

  position?: AuctionState["position"];
  competition?: AuctionState["competition"];

  strategy?: AuctionState["strategy"];
}

/**
 * A single bidding rule.
 */
export interface BiddingRule {
  /** Unique identifier */
  id: string;

  /** Bid this rule recommends, e.g. "1S", "1NT", "2C" */
  bid: string;

  /** Opening / response / rebid */
  phase: "opening" | "response" | "rebid";

  /** Higher number = stronger preference */
  priority: number;

  /** Is this bid forcing? */
  forcing: boolean;

  /** Conditions under which the rule applies */
  conditions: RuleCondition;

  /** Human-readable explanation */
  explanation: string;
}
