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
    const normalizeCardToken = (value) => {
      const raw = String(value || "").trim().toUpperCase();
      if (!raw) return null;

      const compact = raw
        .replace(/\s+/g, "")
        .replace("♠", "S")
        .replace("♥", "H")
        .replace("♦", "D")
        .replace("♣", "C");

      const directMatch = compact.match(/^(10|[AKQJT98765432])([SHDC])$/);
      if (directMatch) {
        const rank = directMatch[1] === "10" ? "T" : directMatch[1];
        return `${rank}${directMatch[2]}`;
      }

      const reversedMatch = compact.match(/^([SHDC])(10|[AKQJT98765432])$/);
      if (reversedMatch) {
        const rank = reversedMatch[2] === "10" ? "T" : reversedMatch[2];
        return `${rank}${reversedMatch[1]}`;
      }

      return null;
    };

    const normalizeCards = (rawCards) => {
      const cleaned = Array.isArray(rawCards) ? rawCards : [];
      return [...new Set(
        cleaned
          .map((card) => normalizeCardToken(card))
          .filter(Boolean),
      )];
    };

    const parseCardPayload = (rawText) => {
      const cleaned = String(rawText || "")
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .replace(/'/g, '"')
        .replace(/,\s*]/g, "]")
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        return [];
      }

      if (Array.isArray(parsed)) {
        return normalizeCards(parsed);
      }

      if (parsed && typeof parsed === "object" && Array.isArray(parsed.cards)) {
        return normalizeCards(parsed.cards);
      }

      return [];
    };

    const runVisionPass = async ({ model, instruction, detail = "high" }) => {
      const response = await openai.chat.completions.create({
        model,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "bridge_cards",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                cards: {
                  type: "array",
                  items: { type: "string" },
                },
              },
              required: ["cards"],
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: instruction,
              },
              {
                type: "image_url",
                image_url: {
                  url: base64,
                  detail,
                },
              },
            ],
          },
        ],
      });

      const text = response?.choices?.[0]?.message?.content || "";
      return parseCardPayload(text);
    };

    const attempts = [];

    const plannedPasses = [
      {
        model: "gpt-4o",
        detail: "high",
        instruction: [
          "Read this bridge hand photo and return cards from visible corners.",
          "Output strict JSON object only: {\"cards\":[\"AS\",\"KH\",\"QD\"]}",
          "Use ranks A,K,Q,J,T,9..2 and suits S,H,D,C.",
          "Detect exactly 13 cards when possible. No explanations.",
        ].join(" "),
      },
      {
        model: "gpt-4o",
        detail: "high",
        instruction: [
          "This is a fanned bridge hand. Focus on top-left rank/suit indices of each card.",
          "Avoid duplicates. Keep only confidently visible cards.",
          "Return strict JSON object only: {\"cards\":[...]}.",
        ].join(" "),
      },
      {
        model: "gpt-4.1",
        detail: "high",
        instruction: [
          "Detect cards from this bridge hand image using index symbols and partial corners.",
          "Use only valid card tokens like AS, KH, TD.",
          "Return strict JSON object only: {\"cards\":[...]}.",
        ].join(" "),
      },
      {
        model: "gpt-4.1-mini",
        detail: "high",
        instruction: [
          "Fallback pass: detect as many valid cards as possible from this bridge hand image.",
          "Return strict JSON object only: {\"cards\":[...]}.",
        ].join(" "),
      },
    ];

    for (const pass of plannedPasses) {
      try {
        const result = await runVisionPass(pass);
        attempts.push(result);
        if (result.length === 13) break;
      } catch (scanErr) {
        console.warn(`Vision pass failed for ${pass.model}:`, scanErr?.message || scanErr);
      }
    }

    const mergeByConsensus = (attemptSets) => {
      const voteMap = new Map();

      for (const set of attemptSets) {
        const weight = set.length === 13 ? 2 : 1;
        for (const card of set) {
          voteMap.set(card, (voteMap.get(card) || 0) + weight);
        }
      }

      return [...voteMap.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([card]) => card)
        .slice(0, 13);
    };

    const scoreCards = (cards) => {
      const validCountScore = cards.length;
      const thirteenBonus = cards.length === 13 ? 100 : 0;
      return thirteenBonus + validCountScore;
    };

    const bestSingleAttempt = attempts
      .slice()
      .sort((a, b) => scoreCards(b) - scoreCards(a))[0] || [];

    const consensusCards = mergeByConsensus(attempts);

    const cards = consensusCards.length >= bestSingleAttempt.length
      ? consensusCards
      : bestSingleAttempt;

    if (cards.length !== 13) {
      console.warn(`Card scan did not reach 13 cards. Best attempt count: ${cards.length}`);
    }

    return res.json({ cards, count: cards.length });

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

function normalizeBidText(bid) {
  return String(bid || "").trim().toUpperCase();
}

function isContractCall(bid) {
  return /^[1-7](C|D|H|S|NT)$/.test(normalizeBidText(bid));
}

function contractOrderValue(bid) {
  const normalized = normalizeBidText(bid);
  if (!isContractCall(normalized)) return -1;
  const level = Number.parseInt(normalized[0], 10);
  const strain = normalized.slice(1);
  const strainOrder = { C: 0, D: 1, H: 2, S: 3, NT: 4 };
  return level * 5 + strainOrder[strain];
}

function seatSide(seat, handSeat) {
  const partnerSeat = partnerOf(handSeat);
  return seat === handSeat || seat === partnerSeat ? "us" : "opp";
}

function getLegalCalls(auction, dealer, handSeat = "S") {
  const entries = normalizeAuctionEntries(auction, dealer);
  const currentSeat = turnSeatForIndex(dealer, entries.length);
  if (currentSeat !== handSeat) return [];

  const allContracts = [];
  const strains = ["C", "D", "H", "S", "NT"];
  for (let level = 1; level <= 7; level++) {
    for (const strain of strains) {
      allContracts.push(`${level}${strain}`);
    }
  }

  const lastContractEntry = [...entries].reverse().find((entry) => isContractCall(entry.bid));
  const lastContractOrder = lastContractEntry ? contractOrderValue(lastContractEntry.bid) : -1;
  const legalContracts = allContracts.filter((bid) => contractOrderValue(bid) > lastContractOrder);

  const legalCalls = ["P", ...legalContracts];

  const lastNonPass = [...entries].reverse().find((entry) => normalizeBidText(entry.bid) !== "P");
  if (!lastNonPass) return legalCalls;

  const currentSide = seatSide(currentSeat, handSeat);
  const lastSide = seatSide(lastNonPass.seat, handSeat);
  const lastBid = normalizeBidText(lastNonPass.bid);

  if (isContractCall(lastBid) && lastSide === "opp") {
    legalCalls.push("X");
  }

  if (lastBid === "X" && lastSide === "opp") {
    legalCalls.push("XX");
  }

  return [...new Set(legalCalls)];
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
  hand,
  openingBid,
  supportSuit,
}) {
  if (entry.minHCP !== undefined && hcp < entry.minHCP) return false;
  if (entry.maxHCP !== undefined && hcp > entry.maxHCP) return false;

  if (entry.minAces !== undefined || entry.maxAces !== undefined) {
    const aces = countAces(hand || []);
    if (entry.minAces !== undefined && aces < entry.minAces) return false;
    if (entry.maxAces !== undefined && aces > entry.maxAces) return false;
  }

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
  if (entry.maxDiamonds !== undefined && distribution.D > entry.maxDiamonds) return false;
  if (entry.maxClubs !== undefined && distribution.C > entry.maxClubs) return false;

  if (entry.singletonOrVoid !== undefined) {
    const shortnessSuitRaw = String(entry.singletonOrVoid).trim().toUpperCase();
    const suitMap = {
      S: "S",
      SPADE: "S",
      SPADES: "S",
      H: "H",
      HEART: "H",
      HEARTS: "H",
      D: "D",
      DIAMOND: "D",
      DIAMONDS: "D",
      C: "C",
      CLUB: "C",
      CLUBS: "C",
    };
    const shortnessSuit = suitMap[shortnessSuitRaw] || null;
    if (!shortnessSuit) return false;
    if (distribution[shortnessSuit] > 1) return false;
  }

  if (entry.balanced === true && !isBalancedDistribution(distribution)) return false;
  if (entry.denyFourCardMajor === true && (distribution.S >= 4 || distribution.H >= 4)) return false;
  if (entry.denyFiveCardMajor === true && (distribution.S >= 5 || distribution.H >= 5)) return false;

  return true;
}

function buildRuleAdvice({
  interpretedAuction,
  chosenBid,
  entry,
  systemConfig,
  conventionContinuations = [],
  conventionSequenceKey = null,
}) {
  const appliedConventions = entry.convention ? [entry.convention] : [];
  const conventionGuidance = entry.convention
    ? [
        buildConventionGuidanceItem({
          systemConfig,
          conventionName: entry.convention,
          whyUsedNow: entry.description || `Rule conditions match for ${chosenBid}.`,
          preferredSequenceKey: conventionSequenceKey,
          initialPossibleCalls: conventionContinuations,
        }),
      ]
    : [];

  return {
    auctionAnalysis: interpretedAuction.map((a) => ({ seat: a.seat, bid: a.bid, meaning: a.meaning })),
    appliedConventions,
    conventionGuidance,
    bid: chosenBid,
    explanation: entry.description || `System rule match: bid ${chosenBid}.`,
  };
}

function sortConventionCalls(calls) {
  return calls.sort((a, b) => {
    if (isContractCall(a.bid) && isContractCall(b.bid)) {
      return contractOrderValue(a.bid) - contractOrderValue(b.bid);
    }
    return String(a.bid).localeCompare(String(b.bid));
  });
}

function summarizeConventionRule(rule = {}) {
  const details = [];
  const hcpText = formatHcpRange(rule);
  if (hcpText) details.push(hcpText);
  if (rule.description) details.push(rule.description);
  if (rule.transfersTo) details.push(`transfer to ${rule.transfersTo}`);
  if (rule.waiting) details.push("waiting");
  if (rule.forcingToGame) details.push("game forcing");
  else if (rule.forcing) details.push("forcing");
  else if (rule.invitational) details.push("invitational");
  return details.join(" — ") || "Convention action";
}

function collectConventionContinuationsBySequence({ systemConfig, sequenceKey, conventionName }) {
  const rebidRules = systemConfig?.rebids?.openerRebids?.[sequenceKey];
  if (!rebidRules || typeof rebidRules !== "object") return [];

  const continuations = [];
  for (const [bid, rule] of Object.entries(rebidRules)) {
    if (!rule || typeof rule !== "object") continue;
    if (conventionName && String(rule.convention || "") !== String(conventionName)) continue;
    continuations.push({
      bid,
      description: summarizeConventionRule(rule),
      sequence: sequenceKey,
    });
  }

  return sortConventionCalls(continuations);
}

function collectConventionContinuationsGlobal({ systemConfig, conventionName }) {
  const results = [];

  const firstResponseByOpening = systemConfig?.responses?.byOpening || {};
  for (const [openingBid, openingConfig] of Object.entries(firstResponseByOpening)) {
    const firstResponse = openingConfig?.firstResponse;
    if (!Array.isArray(firstResponse)) continue;
    for (const rule of firstResponse) {
      if (!rule || typeof rule !== "object") continue;
      if (String(rule.convention || "") !== String(conventionName)) continue;
      if (!rule.bid) continue;
      results.push({
        bid: String(rule.bid),
        description: summarizeConventionRule(rule),
        sequence: `${openingBid} (first response)`,
      });
    }
  }

  const openerRebids = systemConfig?.rebids?.openerRebids || {};
  for (const [sequenceKey, sequenceRules] of Object.entries(openerRebids)) {
    if (!sequenceRules || typeof sequenceRules !== "object") continue;
    for (const [rebid, rule] of Object.entries(sequenceRules)) {
      if (!rule || typeof rule !== "object") continue;
      if (String(rule.convention || "") !== String(conventionName)) continue;
      results.push({
        bid: String(rebid),
        description: summarizeConventionRule(rule),
        sequence: sequenceKey,
      });
    }
  }

  const dedup = new Map();
  for (const item of sortConventionCalls(results)) {
    const key = `${item.sequence || ""}|${item.bid}|${item.description}`;
    if (!dedup.has(key)) dedup.set(key, item);
  }

  return Array.from(dedup.values()).slice(0, 14);
}

function collectConventionContinuations({
  systemConfig,
  sequenceKey,
  conventionName,
  includeGlobalFallback = true,
}) {
  const bySequence = sequenceKey
    ? collectConventionContinuationsBySequence({ systemConfig, sequenceKey, conventionName })
    : [];

  if (bySequence.length > 0 || !includeGlobalFallback) return bySequence;
  return collectConventionContinuationsGlobal({ systemConfig, conventionName });
}

function buildConventionGuidanceItem({
  systemConfig,
  conventionName,
  whyUsedNow,
  preferredSequenceKey = null,
  initialPossibleCalls = [],
}) {
  const whenToUse = systemConfig?.conventions?.[conventionName] || "System convention";
  const possibleCalls = Array.isArray(initialPossibleCalls) && initialPossibleCalls.length > 0
    ? initialPossibleCalls
    : collectConventionContinuations({
        systemConfig,
        sequenceKey: preferredSequenceKey,
        conventionName,
        includeGlobalFallback: true,
      });

  return {
    name: conventionName,
    whenToUse,
    whyUsedNow,
    possibleCalls,
  };
}

function deriveConventionSequenceKey({ auction, dealer, handSeat = "S" }) {
  const entries = normalizeAuctionEntries(auction, dealer);
  const partnerSeat = partnerOf(handSeat);

  const ourOpening = entries.find((entry) => entry.seat === handSeat && isContractBid(entry.bid));
  if (!ourOpening) return null;

  const partnerResponse = entries.find(
    (entry) => entry.index > ourOpening.index && entry.seat === partnerSeat && isContractBid(entry.bid),
  );

  if (!partnerResponse) return null;
  return `${ourOpening.bid}-${partnerResponse.bid}`;
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

function countAces(hand) {
  let aces = 0;
  for (const card of hand || []) {
    const cardStr = extractCardString(card);
    if (!cardStr) continue;
    if (cardStr[0] === "A") aces++;
  }
  return aces;
}

function latestPartnershipSuit(entries, handSeat, partnerSeat) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.seat !== handSeat && entry.seat !== partnerSeat) continue;
    const suit = bidSuit(entry.bid);
    if (suit) return suit;
  }
  return null;
}

function formatHcpRange(rule) {
  if (rule.minHCP !== undefined && rule.maxHCP !== undefined) return `${rule.minHCP}-${rule.maxHCP} HCP`;
  if (rule.minHCP !== undefined) return `${rule.minHCP}+ HCP`;
  if (rule.maxHCP !== undefined) return `up to ${rule.maxHCP} HCP`;
  return null;
}

function isFourthSuitForcingContext({ auction, dealer, handSeat = "S", candidateBid }) {
  const entries = normalizeAuctionEntries(auction, dealer);
  const partnerSeat = partnerOf(handSeat);
  const partnershipContracts = entries.filter(
    (entry) =>
      (entry.seat === handSeat || entry.seat === partnerSeat) &&
      isContractBid(normalizeBidText(entry.bid)),
  );

  if (partnershipContracts.length < 3) return false;

  const firstPartnershipContract = partnershipContracts[0];
  if (!firstPartnershipContract || firstPartnershipContract.seat !== partnerSeat) {
    return false;
  }

  const ourContractsSoFar = partnershipContracts.filter((entry) => entry.seat === handSeat);
  if (ourContractsSoFar.length !== 1) return false;

  const firstThree = partnershipContracts.slice(0, 3);
  if (firstThree[firstThree.length - 1]?.seat !== partnerSeat) return false;

  const firstThreeSuits = firstThree.map((entry) => bidSuit(entry.bid));
  if (firstThreeSuits.some((suit) => !suit || suit === "NT")) return false;

  const uniqueSuits = new Set(firstThreeSuits);
  if (uniqueSuits.size !== 3) return false;

  const candidateSuit = bidSuit(candidateBid);
  if (!candidateSuit || candidateSuit === "NT") return false;

  return !uniqueSuits.has(candidateSuit);
}

function isConventionValidForContext({ conventionName, auction, dealer, handSeat, bid }) {
  const normalized = String(conventionName || "").trim().toLowerCase();

  if (normalized === "fourth suit forcing") {
    return isFourthSuitForcingContext({
      auction,
      dealer,
      handSeat,
      candidateBid: bid,
    });
  }

  return true;
}

function describeResponderRule(openingBid, responseBid, systemConfig) {
  const firstResponseRules = systemConfig?.responses?.byOpening?.[openingBid]?.firstResponse;
  if (!Array.isArray(firstResponseRules)) {
    return "Responder meaning not mapped in current system. [Confidence: Low | Ambiguity: High]";
  }

  const normalizedBid = normalizeBidText(responseBid);
  const exactRule = firstResponseRules.find((rule) => normalizeBidText(rule?.bid) === normalizedBid);

  if (exactRule) {
    const parts = [];

    if (exactRule.convention) {
      parts.push(`${exactRule.convention}`);
    } else if (exactRule.artificial) {
      parts.push("Artificial response");
    } else {
      parts.push("Natural response");
    }

    const hcpText = formatHcpRange(exactRule);
    if (hcpText) parts.push(hcpText);

    if (exactRule.minSupport !== undefined) parts.push(`${exactRule.minSupport}+ trump support`);
    if (exactRule.minLength !== undefined) parts.push(`${exactRule.minLength}+ card suit`);
    if (exactRule.minSpades !== undefined) parts.push(`${exactRule.minSpades}+ spades`);
    if (exactRule.minHearts !== undefined) parts.push(`${exactRule.minHearts}+ hearts`);
    if (exactRule.minDiamonds !== undefined) parts.push(`${exactRule.minDiamonds}+ diamonds`);
    if (exactRule.minClubs !== undefined) parts.push(`${exactRule.minClubs}+ clubs`);

    if (exactRule.forcingToGame) parts.push("game forcing");
    else if (exactRule.forcing) parts.push("forcing one round");
    else if (exactRule.semiForcing) parts.push("semi-forcing");
    else if (exactRule.invitational) parts.push("invitational");

    if (exactRule.transfersTo) parts.push(`transfer to ${exactRule.transfersTo}`);
    if (exactRule.waiting) parts.push("waiting response");

    return `${parts.join(", ")}. [Confidence: High | Ambiguity: Low]`;
  }

  if (/^1[CDHS]$/.test(normalizedBid) && /^1[CDHS]$/.test(normalizeBidText(openingBid))) {
    return "Likely one-level new-suit response (typically forcing, 6+ HCP, 4+ suit). [Confidence: Medium | Ambiguity: Medium]";
  }

  return "Responder bid not found in first-response table for this opening. [Confidence: Low | Ambiguity: High]";
}

function toShortMeaningText(meaning) {
  const cleaned = String(meaning || "")
    .replace(/\s*\[Confidence:[^\]]+\]\s*/g, "")
    .trim();

  return cleaned || "Responder meaning not mapped in current system.";
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
      if (entryMatchesRule({ entry: ruleEntry, hcp, distribution, hand: selectedHand, openingBid })) {
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
        hand: selectedHand,
        openingBid: opening,
        supportSuit: bidSuit(opening),
      })) {
        const sequenceKey = `${opening}-${rule.bid}`;
        const conventionContinuations = rule.convention
          ? collectConventionContinuations({
              systemConfig,
              sequenceKey,
              conventionName: rule.convention,
            })
          : [];

        return buildRuleAdvice({
          interpretedAuction,
          chosenBid: rule.bid,
          entry: rule,
          systemConfig,
          conventionContinuations,
          conventionSequenceKey: sequenceKey,
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
      const firstResponseRules = systemConfig?.responses?.byOpening?.[openingBid]?.firstResponse || [];
      const partnerResponseRule = Array.isArray(firstResponseRules)
        ? firstResponseRules.find((rule) => normalizeBidText(rule?.bid) === normalizeBidText(partnerResponse.bid))
        : null;
      const activeConventionName = partnerResponseRule?.convention || null;
      const conventionContinuations = activeConventionName
        ? collectConventionContinuations({
            systemConfig,
            sequenceKey,
            conventionName: activeConventionName,
          })
        : [];

      if (rebidRules && typeof rebidRules === "object") {
        const candidateMatches = [];
        for (const [rebid, rule] of Object.entries(rebidRules)) {
          const ruleEntry = { bid: rebid, ...(rule || {}) };
          if (entryMatchesRule({
            entry: ruleEntry,
            hcp,
            distribution,
            hand: selectedHand,
            openingBid,
            supportSuit: bidSuit(partnerResponse.bid),
          })) {
            candidateMatches.push({ rebid, ruleEntry });
          }
        }

        if (candidateMatches.length > 0) {
          const sortCandidates = (a, b) => {
            const aPriority = a.ruleEntry.priority ?? Number.MAX_SAFE_INTEGER;
            const bPriority = b.ruleEntry.priority ?? Number.MAX_SAFE_INTEGER;
            if (aPriority !== bPriority) return aPriority - bPriority;

            const aOrder = isContractCall(a.rebid) ? contractOrderValue(a.rebid) : Number.MAX_SAFE_INTEGER;
            const bOrder = isContractCall(b.rebid) ? contractOrderValue(b.rebid) : Number.MAX_SAFE_INTEGER;
            return aOrder - bOrder;
          };

          const partnerSuit = bidSuit(partnerResponse.bid);
          const partnerLevel = toLevel(partnerResponse.bid);

          if (partnerSuit && Number.isFinite(partnerLevel)) {
            const supportRaiseCandidates = candidateMatches.filter((candidate) => {
              const candidateSuit = bidSuit(candidate.rebid);
              const candidateLevel = toLevel(candidate.rebid);
              return candidateSuit === partnerSuit && Number.isFinite(candidateLevel) && candidateLevel > partnerLevel;
            });

            if (supportRaiseCandidates.length > 0) {
              const singleRaise = supportRaiseCandidates
                .filter((candidate) => toLevel(candidate.rebid) === partnerLevel + 1)
                .sort(sortCandidates)[0];

              const chosenSupportRaise = singleRaise || supportRaiseCandidates.sort(sortCandidates)[0];
              return buildRuleAdvice({
                interpretedAuction,
                chosenBid: chosenSupportRaise.rebid,
                entry: chosenSupportRaise.ruleEntry,
                systemConfig,
                conventionContinuations,
                conventionSequenceKey: sequenceKey,
              });
            }
          }

          const chosenCandidate = candidateMatches.sort(sortCandidates)[0];
          return buildRuleAdvice({
            interpretedAuction,
            chosenBid: chosenCandidate.rebid,
            entry: chosenCandidate.ruleEntry,
            systemConfig,
            conventionContinuations,
            conventionSequenceKey: sequenceKey,
          });
        }
      }
    }
  }

  return null;
}

function getStructuredRebidContext({ auction, dealer, handSeat = "S", hcp, distribution, systemConfig }) {
  const entries = normalizeAuctionEntries(auction, dealer);
  const partnerSeat = partnerOf(handSeat);
  const firstContract = entries.find((entry) => isContractBid(entry.bid));
  if (!firstContract) return null;
  if (firstContract.seat !== handSeat) return null;

  const hasCompetition = entries.some(
    (entry) => entry.index > firstContract.index && entry.seat !== handSeat && entry.seat !== partnerSeat && entry.bid !== "P",
  );
  if (hasCompetition) return null;

  const ourNonPassBids = entries.filter((entry) => entry.seat === handSeat && entry.bid !== "P");
  if (ourNonPassBids.length !== 1) return null;

  const openingBid = ourNonPassBids[0].bid;
  const partnerResponse = entries.find(
    (entry) => entry.index > firstContract.index && entry.seat === partnerSeat && entry.bid !== "P" && isContractBid(entry.bid),
  );
  if (!partnerResponse) return null;

  const sequenceKey = `${openingBid}-${partnerResponse.bid}`;
  const rebidRules = systemConfig?.rebids?.openerRebids?.[sequenceKey];
  if (!rebidRules || typeof rebidRules !== "object") return null;

  return {
    openingBid,
    partnerResponseBid: partnerResponse.bid,
    supportSuit: bidSuit(partnerResponse.bid),
    hcp,
    distribution,
    rebidRules,
  };
}

function isAiBidValidForStructuredRebid({ context, bid }) {
  if (!context) return true;
  if (!isContractBid(bid)) return true;

  const rule = context.rebidRules?.[bid];
  if (!rule || typeof rule !== "object") return false;

  const ruleEntry = { bid, ...rule };
  return entryMatchesRule({
    entry: ruleEntry,
    hcp: context.hcp,
    distribution: context.distribution,
    openingBid: context.openingBid,
    supportSuit: context.supportSuit,
  });
}

function interpretAuction(auction, dealer, handSeat = "S", systemConfig = null) {

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
  const normalizedEntries = normalizeAuctionEntries(auction, dealer);
  const openingEntry = normalizedEntries.find((entry) => isContractBid(normalizeBidText(entry.bid)));
  const responderSeat = openingEntry ? partnerOf(openingEntry.seat) : null;
  const firstResponderEntry = openingEntry && responderSeat
    ? normalizedEntries.find(
        (entry) =>
          entry.index > openingEntry.index &&
          entry.seat === responderSeat &&
          isContractBid(normalizeBidText(entry.bid)),
      )
    : null;

  return auction.map((entry, i) => {

    const seat = entry.seat || seatAt(i);
    const partnerSeat = partnerOf(handSeat);
    const side = (seat === handSeat || seat === partnerSeat) ? "Us" : "Opp";

    const bid = normalizeBidText(entry.bid);
    let meaning = "Unknown";

    // PASS
    if (bid === "P") {
      meaning = "Pass";
    }

    // OPENING BIDS
    else if (openingEntry && i === openingEntry.index) {
      if (bid === "1C" || bid === "1D")
        meaning = "HCP 12–21, length 3+";
      if (bid === "1H" || bid === "1S")
        meaning = "HCP 12–21, length 5+";
      if (bid === "1NT")
        meaning = "HCP 15–17, balanced";
    }

    if (
      firstResponderEntry &&
      i === firstResponderEntry.index &&
      openingEntry &&
      systemConfig
    ) {
      meaning = describeResponderRule(openingEntry.bid, bid, systemConfig);
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
    const { auction, dealer, handSeat, system } = req.body;

    if (!Array.isArray(auction) || typeof dealer !== "string") {
      return res.status(400).json({ error: "Missing auction data" });
    }

    if (auction.length === 0) {
      return res.json({ explanation: "" });
    }

    const systemConfig = loadSystem(system || "sayc");
    const interpreted = interpretAuction(auction, dealer, handSeat || "S", systemConfig);
    const last = interpreted[interpreted.length - 1];
    const normalizedEntries = normalizeAuctionEntries(auction, dealer);
    const lastEntry = normalizedEntries[normalizedEntries.length - 1];
    const firstContractEntry = normalizedEntries.find((entry) => isContractBid(normalizeBidText(entry.bid)));
    const effectiveHandSeat = handSeat || "S";
    const partnerSeat = partnerOf(effectiveHandSeat);

    let meaning = last?.meaning || "Unknown";
    let partnerHcpRange = "HCP unknown";

    if (
      lastEntry &&
      lastEntry.seat === partnerSeat &&
      isContractBid(normalizeBidText(lastEntry.bid))
    ) {
      const ourOpeningEntry = normalizedEntries.find(
        (entry) =>
          entry.seat === effectiveHandSeat &&
          isContractBid(normalizeBidText(entry.bid)),
      );

      if (ourOpeningEntry && lastEntry.index > ourOpeningEntry.index) {
        const firstResponseRules = systemConfig?.responses?.byOpening?.[normalizeBidText(ourOpeningEntry.bid)]?.firstResponse;
        if (Array.isArray(firstResponseRules)) {
          const responderRule = firstResponseRules.find(
            (rule) => normalizeBidText(rule?.bid) === normalizeBidText(lastEntry.bid),
          );
          if (responderRule && typeof responderRule === "object") {
            partnerHcpRange = formatHcpRange(responderRule) || partnerHcpRange;
          }
        }

        meaning = describeResponderRule(
          normalizeBidText(ourOpeningEntry.bid),
          normalizeBidText(lastEntry.bid),
          systemConfig,
        );
      }

      const partnerOpeningEntry = normalizedEntries.find(
        (entry) =>
          entry.seat === partnerSeat &&
          isContractBid(normalizeBidText(entry.bid)),
      );

      const ourResponseToPartnerOpening = partnerOpeningEntry
        ? normalizedEntries.find(
            (entry) =>
              entry.index > partnerOpeningEntry.index &&
              entry.seat === effectiveHandSeat &&
              isContractBid(normalizeBidText(entry.bid)),
          )
        : null;

      if (
        partnerOpeningEntry &&
        ourResponseToPartnerOpening &&
        lastEntry.index > ourResponseToPartnerOpening.index
      ) {
        const sequenceKey = `${normalizeBidText(partnerOpeningEntry.bid)}-${normalizeBidText(ourResponseToPartnerOpening.bid)}`;
        const openerRebidRule = systemConfig?.rebids?.openerRebids?.[sequenceKey]?.[normalizeBidText(lastEntry.bid)];

        if (openerRebidRule && typeof openerRebidRule === "object") {
          partnerHcpRange = formatHcpRange(openerRebidRule) || partnerHcpRange;
          meaning = openerRebidRule.description || meaning;
        }
      }

      if (
        partnerOpeningEntry &&
        lastEntry.index === partnerOpeningEntry.index &&
        firstContractEntry &&
        partnerOpeningEntry.index === firstContractEntry.index
      ) {
        const openingRule = systemConfig?.openingStructure?.[normalizeBidText(lastEntry.bid)];
        if (openingRule && typeof openingRule === "object") {
          partnerHcpRange = formatHcpRange(openingRule) || partnerHcpRange;
        }
      }
    }

    if (!meaning || meaning === "Unknown") {
      meaning = "Responder meaning not mapped in current system.";
    }

    const shortMeaning = toShortMeaningText(meaning);
    const partnerBidHistory = normalizedEntries
      .filter((entry) => entry.seat === partnerSeat && normalizeBidText(entry.bid) !== "P")
      .map((entry) => normalizeBidText(entry.bid));

    const historySuffix = partnerBidHistory.length > 1
      ? ` Partner sequence: ${partnerBidHistory.join(" → ")}.`
      : "";

    res.json({
      explanation: `${last.seatName} (${last.side}) bids ${last.bid}: ${shortMeaning}. Partner HCP: ${partnerHcpRange}.${historySuffix}`
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
    const { selectedHand, auction, dealer, handSeat, vulnerability, system, allowAI = true, forceAI = false } = req.body;
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

    const interpretedAuction = interpretAuction(auction, dealer, handSeat || "S", systemConfig);
    const handContext = deriveHandRole(auction, dealer, handSeat || "S");
    const partnerSeat = handContext.partnerSeat;
    const legalCalls = getLegalCalls(auction, dealer, handSeat || "S");
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

    if (deterministicAdvice && !forceAI) {
      return res.json({ source: "bbt", ...deterministicAdvice });
    }

    if (!allowAI) {
      return res.json({
        source: "none",
        bid: null,
        explanation: "No bid-rebid couple matched in the selected system JSON. Click Ask AI.",
        appliedConventions: [],
        conventionGuidance: [],
        auctionAnalysis: interpretedAuction.map((a) => ({ seat: a.seat, bid: a.bid, meaning: a.meaning })),
      });
    }

    let aiHandAnalysis = {
      hcp,
      suitLengths: distribution,
      shape,
      honorSummary: "Derived from card list",
      notes: "Local computed fallback hand analysis",
    };

    try {
      const handAnalysisPrompt = `
You are a bridge hand evaluator. Analyze only OUR hand and return strict JSON.

OUR_HAND_CARDS: ${selectedHand.map((card) => extractCardString(card)).filter(Boolean).join(" ")}
OUR_HCP_COMPUTED: ${hcp}
OUR_SHAPE_COMPUTED: ${shape}

Return STRICT JSON:
{
  "hcp": number,
  "suitLengths": { "S": number, "H": number, "D": number, "C": number },
  "shape": "string",
  "honorSummary": "short honor/controls summary",
  "notes": "short bidding-relevant hand notes"
}
`;

      const handAnalysisResponse = await openai.responses.create({
        model: "gpt-5.2",
        input: handAnalysisPrompt,
        text: {
          format: {
            type: "json_schema",
            name: "bridge_hand_analysis",
            schema: {
              type: "object",
              additionalProperties: false,
              properties: {
                hcp: { type: "number" },
                suitLengths: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    S: { type: "number" },
                    H: { type: "number" },
                    D: { type: "number" },
                    C: { type: "number" },
                  },
                  required: ["S", "H", "D", "C"],
                },
                shape: { type: "string" },
                honorSummary: { type: "string" },
                notes: { type: "string" },
              },
              required: ["hcp", "suitLengths", "shape", "honorSummary", "notes"],
            },
          },
        },
      });

      const handAnalysisContent = handAnalysisResponse.output?.[0]?.content?.[0]?.text;
      if (handAnalysisContent) {
        const parsedHand = JSON.parse(handAnalysisContent);
        aiHandAnalysis = {
          hcp: Number(parsedHand.hcp ?? hcp),
          suitLengths: {
            S: Number(parsedHand?.suitLengths?.S ?? distribution.S),
            H: Number(parsedHand?.suitLengths?.H ?? distribution.H),
            D: Number(parsedHand?.suitLengths?.D ?? distribution.D),
            C: Number(parsedHand?.suitLengths?.C ?? distribution.C),
          },
          shape: String(parsedHand.shape ?? shape),
          honorSummary: String(parsedHand.honorSummary ?? ""),
          notes: String(parsedHand.notes ?? ""),
        };
      }
    } catch (handErr) {
      console.warn("Hand analysis pre-step failed, using local computed facts:", handErr?.message || handErr);
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
  - You MUST return one bid from LEGAL_CALLS only.


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
AI_HAND_ANALYSIS_JSON: ${JSON.stringify(aiHandAnalysis)}
Our seat: ${handSeat || "S"}
Partner seat: ${partnerSeat}
Our role in auction: ${handContext.role}

Before choosing a bid, rely on AI_HAND_ANALYSIS_JSON to verify that the recommendation matches OUR hand.

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

LEGAL_CALLS:
${legalCalls.join(", ")}

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

    const parsedBid = normalizeBidText(parsed?.bid);
    if (!legalCalls.includes(parsedBid)) {
      return res.status(502).json({
        error: "ChatGPT returned an illegal call for this auction. No non-AI fallback is used in Ask AI mode.",
      });
    }

    const structuredRebidContext = getStructuredRebidContext({
      auction,
      dealer,
      handSeat: handSeat || "S",
      hcp,
      distribution,
      systemConfig,
    });

    const bidValidForStructuredRebid = isAiBidValidForStructuredRebid({
      context: structuredRebidContext,
      bid: parsedBid,
    });

    if (!bidValidForStructuredRebid && deterministicAdvice) {
      return res.json({ source: "bbt", ...deterministicAdvice });
    }

    const rawAppliedConventions = Array.isArray(parsed?.appliedConventions)
      ? parsed.appliedConventions
      : [];
    const validAppliedConventions = rawAppliedConventions.filter((name) =>
      isConventionValidForContext({
        conventionName: name,
        auction,
        dealer,
        handSeat: handSeat || "S",
        bid: parsedBid,
      }),
    );

    const rawConventionGuidance = Array.isArray(parsed?.conventionGuidance)
      ? parsed.conventionGuidance
      : [];
    const validConventionGuidance = rawConventionGuidance.filter((item) =>
      isConventionValidForContext({
        conventionName: item?.name,
        auction,
        dealer,
        handSeat: handSeat || "S",
        bid: parsedBid,
      }),
    );

    const sequenceKeyForGuidance = deriveConventionSequenceKey({
      auction,
      dealer,
      handSeat: handSeat || "S",
    });

    const conventionNamesFromModel = [
      ...validAppliedConventions,
      ...validConventionGuidance.map((item) => item?.name).filter(Boolean),
    ];
    const uniqueConventionNames = Array.from(new Set(conventionNamesFromModel));

    const enrichedConventionGuidance = uniqueConventionNames.map((conventionName) => {
      const modelGuidance = validConventionGuidance.find((item) => item?.name === conventionName);
      return buildConventionGuidanceItem({
        systemConfig,
        conventionName,
        whyUsedNow:
          modelGuidance?.whyUsedNow ||
          `Convention-selected action for ${parsedBid}.`,
        preferredSequenceKey: sequenceKeyForGuidance,
      });
    });

    res.json({
      source: "ai",
      ...parsed,
      bid: parsedBid,
      appliedConventions: validAppliedConventions,
      conventionGuidance: enrichedConventionGuidance,
    });

  } catch (err) {
    console.error("AI ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


/* =========================================================
   AI Explain opponents bids (EXPERIMENTAL)
========================================================= */
app.post("/explain-last-bid-ai-experimental", async (req, res) => {
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