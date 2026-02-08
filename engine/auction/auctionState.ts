export type Level = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type Denomination = "S" | "H" | "D" | "C" | "NT";

export type Bid = "P" | "X" | "XX" | `${Level}${Denomination}`;

export type Position = "opener" | "responder" | "rebidder" | "unknown";

export interface AuctionState {
  auction: Bid[];
  position: Position;
  forcing: boolean;
  system: "SAYC";
  strategy: "FAST" | "THOROUGH";
  competition: "none" | "competitive";
}
