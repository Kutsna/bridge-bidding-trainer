import { computeHandFacts } from "../engine/hand/handFacts.ts";
import { recommendBid } from "../engine/recommendBid.ts";
import { derivePosition } from "../engine/auction/derivePosition.ts";

import { saycOpeningRules } from "../engine/rules/sayc/opening.ts";
import { sayc1NTResponseRules } from "../engine/rules/sayc/ntResponses.ts";
import { saycStaymanReplyRules } from "../engine/rules/sayc/staymanReplies.ts";
import { saycJacobyReplyRules } from "../engine/rules/sayc/jacobyReplies.ts";
import { saycStaymanContinuationRules } from "../engine/rules/sayc/staymanContinuations.ts";

const rules = [
  ...saycOpeningRules,
  ...sayc1NTResponseRules,
  ...saycStaymanReplyRules,
  ...saycJacobyReplyRules,
  ...saycStaymanContinuationRules,
];

function parseHand(text: string) {
  if (!text) return [];
  return text.split(",").map((c) => ({
    rank: c.trim()[0],
    suit: c.trim()[1],
  })) as any[];
}

const app = document.getElementById("app");
if (app) {
  app.innerHTML = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 20px auto; padding: 20px; border: 1px solid #ccc; border-radius: 8px; background: #f9f9f9;">
      <h2 style="color: #333;">Bridge Bidding Trainer (SAYC)</h2>

      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Hand (comma separated):</label>
        <input id="hand" style="width: 100%; padding: 8px; box-sizing: border-box;" value="AS,KS,7S,4S,QH,JH,6H,2H,AD,8D,3D,9C,5C"/>
      </div>

      <div style="margin-bottom: 15px;">
        <label style="display: block; margin-bottom: 5px; font-weight: bold;">Auction (comma separated):</label>
        <input id="auction" style="width: 100%; padding: 8px; box-sizing: border-box;" value="1NT,2C"/>
      </div>

      <button id="go" style="background: #007bff; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; font-size: 16px;">Recommend Bid</button>

      <div id="output-container" style="margin-top: 20px; padding: 15px; background: #fff; border: 1px solid #ddd; border-radius: 4px; min-height: 50px; white-space: pre-wrap;"></div>
    </div>
  `;

  document.getElementById("go")!.onclick = () => {
    const handText = (document.getElementById("hand") as HTMLInputElement).value;
    const auctionText = (document.getElementById("auction") as HTMLInputElement).value;
    const output = document.getElementById("output-container")!;

    try {
      const hand = parseHand(handText);
      const auction = auctionText ? auctionText.split(",").map((b) => b.trim()) : [];

      const auctionState = {
        auction,
        position: derivePosition(auction),
        forcing: false,
        system: "SAYC",
        strategy: "THOROUGH",
        competition: "none",
      };

      const facts = computeHandFacts(hand);
      const rec = recommendBid(rules, facts, auctionState);

      output.innerHTML = rec
        ? \`<strong style="color: #007bff; font-size: 1.2em;">Recommended bid: \${rec.bid}</strong><br/><br/><strong>Explanation:</strong><br/>\${rec.explanation}\`
        : '<span style="color: #666;">No recommendation found.</span>';
    } catch (e: any) {
      output.innerHTML = \`<span style="color: #dc3545;">Error: \${e.message}</span>\`;
    }
  };
}
