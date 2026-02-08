import { AuctionState, Bid } from "./auctionState";

/**
 * Derive the bidding position based on auction history.
 * Assumes non-competitive auction for MVP.
 */
export function derivePosition(auction: Bid[]): AuctionState["position"] {
  const nonPassBids = auction.filter((b) => b !== "P");

  if (nonPassBids.length === 0) {
    return "opener";
  }

  if (nonPassBids.length === 1) {
    return "responder";
  }

  if (nonPassBids.length === 2) {
    return "rebidder";
  }

  return "unknown";
}
