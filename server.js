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
    const cards = JSON.parse(text);

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
    const systemText = formatSystemForPrompt(systemConfig);
    
    const prompt = `
You are a professional contract bridge bidding engine.

${systemText}

IMPORTANT:
1. You MUST strictly follow this system.
2. Do not invent conventions.
3. Use provided HCP and shape exactly.

HAND:
Cards: ${JSON.stringify(selectedHand)}
HCP: ${hcp}
Shape: ${shape}

AUCTION:
${auction.length
  ? auction.map(a => `${a.seat}: ${a.bid}`).join("\n")
  : "No bids yet"}

Dealer: ${dealer}
Vulnerability: ${vulnerability}

SYSTEM: Modern Standard American Yellow Card (SAYC, Weak NT style).

ABSOLUTE RULES:

1. You MUST analyze the entire auction in order before making any recommendation.
2. You MUST interpret each bid seat-by-seat.
3. You MUST determine:
   - Partnership
   - HCP range shown
   - Suit length shown
   - Forcing / non-forcing status
4. Only AFTER full auction analysis may you recommend a bid.
5. If you skip auction analysis, your answer is invalid.

--------------------------------------------------

OPENING STRUCTURE:

• 1♣ / 1♦ = 3+ cards, 12–21 HCP
• 1♥ / 1♠ = 5+ cards, 12–21 HCP
• 1NT = 15–17 balanced
• 2NT = 20–21 balanced
• Weak Twos = 6-card suit, 6–10 HCP
• 2♣ = 22+ HCP or game forcing

RESPONSES:

• 1NT response to suit opening = 6–9 HCP, non-forcing
• New suit at 2-level = 10+ HCP, forcing one round
• Raises show support and defined point ranges
• 1NT opening uses Stayman and Transfers

--------------------------------------------------

IMPORTANT:

DO NOT recount HCP.
DO NOT recalculate distribution.
USE the provided HCP and shape exactly.

--------------------------------------------------

HAND DATA:

Cards: ${JSON.stringify(selectedHand)}
HCP: ${hcp}
Shape (S-H-D-C): ${shape}

--------------------------------------------------

AUCTION (IN ORDER):

${auction.length
  ? auction.map(a => `${a.seat}: ${a.bid}`).join("\n")
  : "No bids yet"}

--------------------------------------------------

TASKS:

STEP 1 — Auction Analysis:
Explain each bid sequentially with:
• Seat
• HCP range shown
• Suit length shown
• Convention name if any
• Forcing / non-forcing status

STEP 2 — Only after completing Step 1:
Recommend the correct next bid in SAYC.

--------------------------------------------------

STRICT JSON OUTPUT ONLY:

{
  "auctionAnalysis": [
    {
      "seat": "S/W/N/E",
      "bid": "string",
      "meaning": "brief explanation including HCP range, length, forcing status"
    }
  ],
  "bid": "string",
  "explanation": "short reasoning under 30 words"
}

NO markdown.
NO commentary.
NO skipping analysis.
ONLY JSON.
`;

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: prompt
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