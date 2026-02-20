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
if (!Array.isArray(cards) || cards.length < 11 ) {
  throw new Error("Check all 13 cards are present");
}

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

function interpretAuction(auction, dealer) {

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

  return auction.map((entry, i) => {

    const seat = entry.seat || seatAt(i);
    const side = (seat === "S" || seat === "N") ? "Us" : "Opp";

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

    return {
      seat,
      seatName: seatFullName(seat),
      side,
      bid,
      meaning
    };
  });
}

/* =========================================================
   AUCTION BID EXPLANATION (INSTANT)
========================================================= */

app.post("/explain-last-bid", (req, res) => {
  try {
    const { auction, dealer } = req.body;

    if (!Array.isArray(auction) || typeof dealer !== "string") {
      return res.status(400).json({ error: "Missing auction data" });
    }

    if (auction.length === 0) {
      return res.json({ explanation: "" });
    }

    const interpreted = interpretAuction(auction, dealer);
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
    const { selectedHand, auction, dealer, vulnerability, system } = req.body;
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

    const interpretedAuction = interpretAuction(auction, dealer);
    
    const prompt = `
You are a strict bridge bidding engine.
You must follow the provided SYSTEM_JSON exactly.

SYSTEM_JSON:
${systemText}

HAND:
HCP: ${hcp}
Shape: ${shape}

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
          bid: { type: "string" },
          explanation: { type: "string" }
        },
        required: ["auctionAnalysis", "bid", "explanation"]
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
    const { auction, dealer, system } = req.body;

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