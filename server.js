console.log("SERVER FILE PATH:", import.meta.url);

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer();

app.use(cors());
app.use(express.json());

console.log("ENV KEY:", process.env.OPENAI_API_KEY ? "LOADED" : "MISSING");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================================================
   CARD RECOGNITION
========================================================= */

app.post("/analyze-cards", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Recognize all visible playing cards. Return ONLY JSON array like ['AS','KH','QD']"
            },
            {
              type: "input_image",
              image_url: base64
            }
          ]
        }
      ]
    });

const text = response.output_text.trim();

let cards;

try {
  // Try normal JSON first
  cards = JSON.parse(text);
} catch (e) {
  console.warn("Invalid JSON from AI, attempting cleanup...");

  // Fix common GPT formatting mistakes
  const cleaned = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/'/g, '"')          // single → double quotes
    .replace(/,\s*]/g, "]")      // trailing commas
    .trim();

  try {
    cards = JSON.parse(cleaned);
  } catch (err) {
    console.error("Still invalid JSON after cleanup:", cleaned);
    throw new Error("AI returned invalid JSON format");
  }
}

// Validate result strictly
if (!Array.isArray(cards)) {
  throw new Error("AI returned invalid format");
}

// Remove duplicates
cards = [...new Set(cards)];

if (cards.length !== 13) {

  console.warn(`Expected 13 cards, got ${cards.length}. Retrying once...`);

  // Retry once automatically
  const retry = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "The image shows a fanned bridge hand. Detect exactly 13 cards. Carefully inspect corners and partially visible ranks. Return ONLY JSON array like [\"AS\",\"KH\",\"QD\"]"
          },
          {
            type: "input_image",
            image_url: base64
          }
        ]
      }
    ]
  });

  let retryText = retry.output_text.trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .replace(/'/g, '"');

  try {
    cards = JSON.parse(retryText);
    cards = [...new Set(cards)];
  } catch {
    console.warn("Retry failed to parse.");
  }
}

return res.json({
  cards,
  count: cards.length
});

res.json({ cards });

  } catch (err) {
    console.error("Recognition error:", err);
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   HCP + Distribution Helpers
========================================================= */
function extractCardString(card) {
  // If already string like "AS"
  if (typeof card === "string") return card;

  // If object like { rank: "A", suit: "S" }
  if (typeof card === "object" && card.rank && card.suit) {
    return card.rank + card.suit;
  }

  return null;
}

function computeHCP(hand) {
  const values = { A: 4, K: 3, Q: 2, J: 1 };
  let total = 0;

  for (let card of hand) {
    const cardStr = extractCardString(card);
    if (!cardStr) continue;

    const rank = cardStr[0];
    if (values[rank]) total += values[rank];
  }

  return total;
}

function computeDistribution(hand) {
  const suits = { S: 0, H: 0, D: 0, C: 0 };

  for (let card of hand) {
    const cardStr = extractCardString(card);
    if (!cardStr) continue;

    const suit = cardStr[cardStr.length - 1];
    if (suits[suit] !== undefined) {
      suits[suit]++;
    }
  }

  return suits;
}

function isBalancedDistribution(distribution) {
  const shape = [distribution.S, distribution.H, distribution.D, distribution.C]
    .sort((a, b) => b - a)
    .join("-");
  return ["4-3-3-3", "4-4-3-2", "5-3-3-2"].includes(shape);
}


function formatSystemForPrompt(systemConfig) {
  let text = `SYSTEM: ${systemConfig.name}\n\n`;

  text += "OPENINGS:\n";
  for (const [bid, rules] of Object.entries(systemConfig.openingStructure || {})) {
    text += `• ${bid}: `;
    if (rules.minHCP !== undefined) text += `${rules.minHCP}`;
    if (rules.maxHCP !== undefined) text += `–${rules.maxHCP}`;
    text += " HCP";
    if (rules.minLength) text += `, ${rules.minLength}+ cards`;
    if (rules.type) text += `, ${rules.type}`;
    text += "\n";
  }

  text += "\nCONVENTIONS:\n";
  for (const [conv, value] of Object.entries(systemConfig.conventions || {})) {
    text += `• ${conv}: ${value}\n`;
  }

  return text;
}

function loadSystem(systemName) {
  try {
    const filePath = path.join(__dirname, "systems", `${systemName}.json`);
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("System file not found:", systemName);
    throw new Error(`System '${systemName}' not found`);
  }
}

function partnerOf(seat) {
  return {
    N: "S",
    S: "N",
    E: "W",
    W: "E",
  }[seat] || "N";
}

function isContractBid(bid) {
  return bid !== "P" && bid !== "X" && bid !== "XX";
}

function normalizeAuctionEntries(auction, dealer) {
  const seats = ["W", "N", "E", "S"];
  const dealerIndex = seats.indexOf(dealer);

  function seatAt(i) {
    return seats[(dealerIndex + i) % 4];
  }

  return auction.map((entry, index) => ({
    index,
    seat: entry.seat || seatAt(index),
    bid: entry.bid,
  }));
}

function deriveHandRole(auction, dealer, handSeat = "S") {
  const entries = normalizeAuctionEntries(auction, dealer);
  const partnerSeat = partnerOf(handSeat);

  const firstContract = entries.find((e) => isContractBid(e.bid));
  const firstHandAction = entries.find((e) => e.seat === handSeat && e.bid !== "P");

  if (!firstHandAction) {
    return {
      role: "not-yet-involved",
      firstHandActionIndex: -1,
      partnerSeat,
    };
  }

  if (firstContract && firstHandAction.index === firstContract.index) {
    return {
      role: "opener",
      firstHandActionIndex: firstHandAction.index,
      partnerSeat,
    };
  }

  if (firstContract) {
    if (firstContract.seat === partnerSeat) {
      return {
        role: "responder",
        firstHandActionIndex: firstHandAction.index,
        partnerSeat,
      };
    }

    if (firstContract.seat !== handSeat && firstContract.seat !== partnerSeat) {
      return {
        role: "overcaller",
        firstHandActionIndex: firstHandAction.index,
        partnerSeat,
      };
    }
  }

  return {
    role: "opener",
    firstHandActionIndex: firstHandAction.index,
    partnerSeat,
  };
}

function bidSuit(bid) {
  if (typeof bid !== "string") return null;
  const suit = bid[bid.length - 1];
  return ["S", "H", "D", "C"].includes(suit) ? suit : null;
}

function toLevel(bid) {
  if (typeof bid !== "string") return 99;
  const level = Number.parseInt(bid[0], 10);
  return Number.isFinite(level) ? level : 99;
}

function turnSeatForIndex(dealer, index) {
  const seats = ["W", "N", "E", "S"];
  const dealerIndex = seats.indexOf(dealer);
  if (dealerIndex < 0) return "S";
  return seats[(dealerIndex + index) % 4];
}

function entryMatchesRule({
  entry,
  hcp,
  distribution,
  openingBid,
  supportSuit,
}) {
  if (entry.minHCP !== undefined && hcp < entry.minHCP) return false;
  if (entry.maxHCP !== undefined && hcp > entry.maxHCP) return false;

  const proposedSuit = bidSuit(entry.bid);

  if (entry.minLength !== undefined && proposedSuit) {
    if (distribution[proposedSuit] < entry.minLength) return false;
  }

  if (entry.minSupport !== undefined) {
    const fitSuit = supportSuit || bidSuit(openingBid);
    if (!fitSuit || distribution[fitSuit] < entry.minSupport) return false;
  }

  if (entry.maxSupport !== undefined) {
    const fitSuit = supportSuit || bidSuit(openingBid);
    if (!fitSuit || distribution[fitSuit] > entry.maxSupport) return false;
  }

  if (entry.minSpades !== undefined && distribution.S < entry.minSpades) return false;
  if (entry.minHearts !== undefined && distribution.H < entry.minHearts) return false;
  if (entry.minDiamonds !== undefined && distribution.D < entry.minDiamonds) return false;
  if (entry.minClubs !== undefined && distribution.C < entry.minClubs) return false;

  if (entry.maxSpades !== undefined && distribution.S > entry.maxSpades) return false;
  if (entry.maxHearts !== undefined && distribution.H > entry.maxHearts) return false;

  if (entry.balanced === true && !isBalancedDistribution(distribution)) return false;
  if (entry.denyFourCardMajor === true && (distribution.S >= 4 || distribution.H >= 4)) return false;
  if (entry.denyFiveCardMajor === true && (distribution.S >= 5 || distribution.H >= 5)) return false;

  return true;
}

function buildRuleAdvice({ interpretedAuction, chosenBid, entry, systemConfig }) {
  const appliedConventions = entry.convention ? [entry.convention] : [];
  const conventionDescription = entry.convention
    ? (systemConfig?.conventions?.[entry.convention] || "System convention")
    : "Natural system rule";

  return {
    auctionAnalysis: interpretedAuction.map((a) => ({ seat: a.seat, bid: a.bid, meaning: a.meaning })),
    appliedConventions,
    conventionGuidance: entry.convention
      ? [
          {
            name: entry.convention,
            whenToUse: conventionDescription,
            whyUsedNow: entry.description || `Rule conditions match for ${chosenBid}.`,
          },
        ]
      : [],
    bid: chosenBid,
    explanation: entry.description || `System rule match: bid ${chosenBid}.`,
  };
}

function minorSuitStrength(hand, targetSuit) {
  const honorPoints = { A: 4, K: 3, Q: 2, J: 1, T: 0.5 };
  let total = 0;

  for (const card of hand || []) {
    const cardStr = extractCardString(card);
    if (!cardStr) continue;
    const suit = cardStr[cardStr.length - 1];
    if (suit !== targetSuit) continue;

    const rank = cardStr[0];
    total += honorPoints[rank] || 0;
  }

  return total;
}

function derivePartnershipPriorityBid({
  selectedHand,
  auction,
  dealer,
  handSeat = "S",
  hcp,
  distribution,
  interpretedAuction,
  systemConfig,
}) {
  const entries = normalizeAuctionEntries(auction, dealer);
  const partnerSeat = partnerOf(handSeat);
  const currentTurnSeat = turnSeatForIndex(dealer, entries.length);
  if (currentTurnSeat !== handSeat) return null;

  const firstContract = entries.find((e) => isContractBid(e.bid));

  if (!firstContract) {
    const openingEntries = Object.entries(systemConfig?.openingStructure || {});
    const openingCandidates = [];

    for (const [openingBid, openingRule] of openingEntries) {
      const ruleEntry = { bid: openingBid, ...openingRule };
      if (entryMatchesRule({ entry: ruleEntry, hcp, distribution, openingBid })) {
        openingCandidates.push({ openingBid, ruleEntry });
      }
    }

    if (openingCandidates.length === 0) return null;

    const oneNTCandidate = openingCandidates.find((c) => c.openingBid === "1NT");
    if (oneNTCandidate && hcp >= 15 && hcp <= 17) {
      return buildRuleAdvice({
        interpretedAuction,
        chosenBid: oneNTCandidate.openingBid,
        entry: oneNTCandidate.ruleEntry,
        systemConfig,
      });
    }

    const hasOneC = openingCandidates.some((c) => c.openingBid === "1C");
    const hasOneD = openingCandidates.some((c) => c.openingBid === "1D");

    if (hasOneC && hasOneD) {
      let preferredMinor = "1C";

      if (distribution.D === 3 && distribution.C === 3) {
        preferredMinor = "1C";
      } else if (distribution.D === 4 && distribution.C === 4) {
        const diamondStrength = minorSuitStrength(selectedHand, "D");
        const clubStrength = minorSuitStrength(selectedHand, "C");
        preferredMinor = diamondStrength >= clubStrength ? "1D" : "1C";
      } else {
        preferredMinor = distribution.D > distribution.C ? "1D" : "1C";
      }

      const chosenMinor = openingCandidates.find((c) => c.openingBid === preferredMinor);

      if (chosenMinor) {
        return buildRuleAdvice({
          interpretedAuction,
          chosenBid: chosenMinor.openingBid,
          entry: chosenMinor.ruleEntry,
          systemConfig,
        });
      }
    }

    const firstCandidate = openingCandidates[0];
    return buildRuleAdvice({
      interpretedAuction,
      chosenBid: firstCandidate.openingBid,
      entry: firstCandidate.ruleEntry,
      systemConfig,
    });
  }

  const hasCompetition = entries.some(
    (e) => e.index > firstContract.index && e.seat !== handSeat && e.seat !== partnerSeat && e.bid !== "P",
  );
  if (hasCompetition) return null;

  const ourNonPassBids = entries.filter((e) => e.seat === handSeat && e.bid !== "P");

  if (firstContract.seat === partnerSeat && ourNonPassBids.length === 0) {
    const opening = firstContract.bid;
    const responseRules = (systemConfig?.responses?.byOpening?.[opening]?.firstResponse || [])
      .slice()
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999) || toLevel(a.bid) - toLevel(b.bid));

    for (const rule of responseRules) {
      if (entryMatchesRule({
        entry: rule,
        hcp,
        distribution,
        openingBid: opening,
        supportSuit: bidSuit(opening),
      })) {
        return buildRuleAdvice({
          interpretedAuction,
          chosenBid: rule.bid,
          entry: rule,
          systemConfig,
        });
      }
    }
  }

  if (firstContract.seat === handSeat && ourNonPassBids.length === 1) {
    const openingBid = ourNonPassBids[0].bid;
    const partnerResponse = entries.find(
      (e) => e.index > firstContract.index && e.seat === partnerSeat && e.bid !== "P" && isContractBid(e.bid),
    );

    if (partnerResponse) {
      const sequenceKey = `${openingBid}-${partnerResponse.bid}`;
      const rebidRules = systemConfig?.rebids?.openerRebids?.[sequenceKey];

      if (rebidRules && typeof rebidRules === "object") {
        for (const [rebid, rule] of Object.entries(rebidRules)) {
          const ruleEntry = { bid: rebid, ...(rule || {}) };
          if (entryMatchesRule({
            entry: ruleEntry,
            hcp,
            distribution,
            openingBid,
            supportSuit: bidSuit(partnerResponse.bid),
          })) {
            return buildRuleAdvice({
              interpretedAuction,
              chosenBid: rebid,
              entry: ruleEntry,
              systemConfig,
            });
          }
        }
      }
    }
  }

  return null;
}

function interpretAuction(auction, dealer, handSeat = "S") {

  const seats = ["W", "N", "E", "S"];
  const dealerIndex = seats.indexOf(dealer);

  function seatAt(i) {
    return seats[(dealerIndex + i) % 4];
  }

  function seatFullName(seat) {
    return {
      N: "North",
      S: "South",
      E: "East",
      W: "West"
    }[seat];
  }

  const handContext = deriveHandRole(auction, dealer, handSeat);

  return auction.map((entry, i) => {

    const seat = entry.seat || seatAt(i);
    const partnerSeat = partnerOf(handSeat);
    const side = (seat === handSeat || seat === partnerSeat) ? "Us" : "Opp";

    const bid = entry.bid;
    let meaning = "Unknown";

    // PASS
    if (bid === "P") {
      meaning = "Pass";
    }

    // OPENING BIDS
    else if (i === 0) {
      if (bid === "1C" || bid === "1D")
        meaning = "HCP 12–21, length 3+";
      if (bid === "1H" || bid === "1S")
        meaning = "HCP 12–21, length 5+";
      if (bid === "1NT")
        meaning = "HCP 15–17, balanced";
    }

    // SIMPLE OVERCALL (after opponent opening)
    else if (i === 3 && bid.startsWith("1")) {
      if (bid === "1S")
        meaning = "HCP 8–16, Spades length 5+";
      else if (bid === "1H")
        meaning = "HCP 8–16, Hearts length 5+";
      else if (bid === "1D")
        meaning = "HCP 8–16, Diamonds length 5+";
      else if (bid === "1C")
        meaning = "HCP 8–16, Clubs length 5+";
    }

    if (seat === handSeat && bid !== "P") {
      if (handContext.role === "opener") {
        meaning = `Your hand as opener: ${meaning}`;
      } else if (handContext.role === "responder") {
        meaning = `Your hand as responder: ${meaning}`;
      } else if (handContext.role === "overcaller") {
        meaning = `Your hand as overcaller: ${meaning}`;
      }
    }

    return {
      seat,
      seatName: seatFullName(seat),
      side,
      bid,
      meaning,
      handRole: handContext.role,
    };
  });
}

/* =========================================================
   AUCTION BID EXPLANATION (INSTANT)
========================================================= */

app.post("/explain-last-bid", (req, res) => {
  try {
    const { auction, dealer, handSeat } = req.body;

    if (!Array.isArray(auction) || typeof dealer !== "string") {
      return res.status(400).json({ error: "Missing auction data" });
    }

    if (auction.length === 0) {
      return res.json({ explanation: "" });
    }

    const interpreted = interpretAuction(auction, dealer, handSeat || "S");
    const last = interpreted[interpreted.length - 1];

    res.json({
      explanation: `${last.seatName} (${last.side}) bids ${last.bid}: ${last.meaning}`
    });

  } catch (err) {
    console.error("Explain error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   AI BID RECOMMENDATION
========================================================= */
app.post("/recommend-bid-ai", async (req, res) => {
  try {
    const { selectedHand, auction, dealer, handSeat, vulnerability, system } = req.body;
    console.log("AUCTION RECEIVED:", JSON.stringify(auction, null, 2));

    if (
      !Array.isArray(selectedHand) ||
      !Array.isArray(auction) ||
      typeof dealer !== "string" ||
      typeof vulnerability !== "string"
    ) {
      return res.status(400).json({ error: "Missing data" });
    }

    // ✅ Compute AFTER validation
    const hcp = computeHCP(selectedHand);
    const distribution = computeDistribution(selectedHand);
    const shape = `${distribution.S}-${distribution.H}-${distribution.D}-${distribution.C}`;
    const systemConfig = loadSystem(system || "sayc");
    const systemText = JSON.stringify(systemConfig, null, 2);
    const formattedSystem = formatSystemForPrompt(systemConfig);
    const requiredConventions = [
      "Stayman",
      "Jacoby Transfers",
      "Jacoby 2NT",
      "Splinters",
      "Cappelletti",
      "Drury",
      "Unusual 2NT",
      "Gerber",
      "Fourth Suit Forcing",
      "Blackwood",
      "Michaels Cuebid",
      "Takeout Doubles",
      "Negative Doubles",
    ];
    const conventionNames = Object.keys(systemConfig.conventions || {});
    const conventionList = conventionNames.length
      ? conventionNames.join(", ")
      : "None provided";
    const requiredConventionList = requiredConventions.join(", ");

    const interpretedAuction = interpretAuction(auction, dealer, handSeat || "S");
    const handContext = deriveHandRole(auction, dealer, handSeat || "S");
    const partnerSeat = handContext.partnerSeat;
    const deterministicAdvice = derivePartnershipPriorityBid({
      selectedHand,
      auction,
      dealer,
      handSeat: handSeat || "S",
      hcp,
      distribution,
      interpretedAuction,
      systemConfig,
    });

    if (deterministicAdvice) {
      return res.json(deterministicAdvice);
    }
    
    const prompt = `
You are a strict bridge bidding engine.
  You must follow the provided SYSTEM_JSON exactly.
  You must evaluate ALL listed conventions and apply any convention that is relevant to this auction.
  If no convention applies, use the system's natural/default structure.
  You must also evaluate the REQUIRED_CONVENTIONS list below and use those conventions whenever legally and contextually applicable.

  IMPORTANT:
  - Do not ignore convention rules listed in the system.
  - Prioritize these conventions when they fit the auction context: Stayman, Jacoby Transfers, Jacoby 2NT, Splinters, Cappelletti, Drury, Unusual 2NT, Gerber, Fourth Suit Forcing, Blackwood, Michaels Cuebid, Takeout Doubles, Negative Doubles.
  - Use convention names exactly as written when reporting what was applied.
  - For each applied convention, explain WHEN it should be used and WHY it applies here.
  - Keep final explanation under 30 words.


SYSTEM_JSON:
${systemText}

  SYSTEM_OVERVIEW:
  ${formattedSystem}

  CONVENTIONS_TO_EVALUATE:
  ${conventionList}

  REQUIRED_CONVENTIONS:
  ${requiredConventionList}

HAND:
HCP: ${hcp}
Shape: ${shape}
Hand cards: ${selectedHand.map((card) => extractCardString(card)).filter(Boolean).join(" ")}
Suit lengths: S=${distribution.S}, H=${distribution.H}, D=${distribution.D}, C=${distribution.C}
Our seat: ${handSeat || "S"}
Partner seat: ${partnerSeat}
Our role in auction: ${handContext.role}

Interpret our bids according to this role:
- opener: opening/rebid logic
- responder: response/continuation logic
- overcaller: competitive overcall/double logic

AUCTION:
${interpretedAuction.length
  ? interpretedAuction
      .map(a => `${a.seat} (${a.side}): ${a.bid}`)
      .join("\n")
  : "No bids yet"}

Return STRICT JSON:
{
  "auctionAnalysis": [
    {
      "seat": "S/W/N/E",
      "bid": "string",
      "meaning": "short meaning"
    }
  ],
  "appliedConventions": ["convention name"],
  "conventionGuidance": [
    {
      "name": "convention name",
      "whenToUse": "short trigger condition",
      "whyUsedNow": "short context reason"
    }
  ],
  "bid": "string",
  "explanation": "under 30 words"
}
`;

    const response = await openai.responses.create({
  model: "gpt-5.2",
  input: prompt,
  text: {
    format: {
      type: "json_schema",
      name: "bridge_bid_response",
      schema: {
        type: "object",
        additionalProperties: false,   // 🔴 REQUIRED
        properties: {
          auctionAnalysis: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,  // 🔴 REQUIRED
              properties: {
                seat: { type: "string" },
                bid: { type: "string" },
                meaning: { type: "string" }
              },
              required: ["seat", "bid", "meaning"]
            }
          },
          appliedConventions: {
            type: "array",
            items: { type: "string" }
          },
          conventionGuidance: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                name: { type: "string" },
                whenToUse: { type: "string" },
                whyUsedNow: { type: "string" }
              },
              required: ["name", "whenToUse", "whyUsedNow"]
            }
          },
          bid: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["auctionAnalysis", "appliedConventions", "conventionGuidance", "bid", "explanation"]
      }
    }
  }
});

    // ✅ Safer extraction (gpt-5.x structure)
    const content = response.output?.[0]?.content?.[0];

    if (!content || !content.text) {
      console.error("Unexpected AI structure:", response);
      return res.status(500).json({ error: "Invalid AI structure" });
    }

    let raw = content.text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    let parsed;

    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("Invalid JSON from AI:", raw);
      return res.status(500).json({
        error: "AI returned invalid JSON",
        raw
      });
    }

    res.json(parsed);

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   AI Explain opponents bids (EXPERIMENTAL)
========================================================= */
app.post("/explain-last-bid", async (req, res) => {
  try {
    const { auction, dealer, handSeat, system } = req.body;

    if (!Array.isArray(auction) || auction.length === 0) {
      return res.json({ explanation: "" });
    }

    const systemConfig = loadSystem(system || "sayc");
    const last = auction[auction.length - 1];

    let explanation = "Standard contract bid.";

    // Opening examples
    if (auction.length === 1) {
      if (last.bid === "1H")
        explanation = "Opening: 5+ hearts, 12–21 HCP.";
      else if (last.bid === "1S")
        explanation = "Opening: 5+ spades, 12–21 HCP.";
      else if (last.bid === "1NT")
        explanation = "Opening: 15–17 balanced.";
      else if (last.bid === "1C" || last.bid === "1D")
        explanation = "Opening: 3+ cards, 12–21 HCP.";
    }

    // Response example
    if (auction.length >= 2) {
      const prev = auction[auction.length - 2];

      if (prev.bid === "1H" && last.bid === "1S")
        explanation = "Response: 4+ spades, 6+ HCP, forcing one round.";
    }

    if (last.bid === "P") explanation = "Pass.";
    if (last.bid === "X") explanation = "Double: takeout or values depending on context.";
    if (last.bid === "XX") explanation = "Redouble.";

    res.json({ explanation });

  } catch (err) {
    console.error("Explain bid error:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================
   TEST ROUTE (PASTE HERE)
========================= */

app.post("/ai-test", async (req, res) => {
  try {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: "Reply exactly with OK_123"
    });

    const raw = response.output_text;
    console.log("AI RAW RESPONSE:", raw);

    res.json({
      success: true,
      raw
    });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* =========================================================
   FRONTEND
========================================================= */

/* ================= STATIC ================= */

app.use(express.static(path.join(__dirname, "dist")));

/* ================= CATCH ALL (GET ONLY) ================= */

app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

/* ================= START SERVER ================= */

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});