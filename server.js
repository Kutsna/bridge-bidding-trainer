console.log("SERVER FILE PATH:", import.meta.url);

import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import multer from "multer";
import OpenAI from "openai";
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
      model: "gpt-5.2",
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


/* =========================================================
   AI BID RECOMMENDATION
========================================================= */
app.post("/recommend-bid-ai", async (req, res) => {
  try {
    const { selectedHand, auction, dealer, vulnerability } = req.body;
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

    const prompt = `
You are an expert-level contract bridge bidding engine.
System: Standard American Yellow Card (SAYC).

You MUST:

1. Determine whose turn it is.
2. Identify the last bid made.
3. Determine whether that bid was by partner or opponent.
4. Interpret what that bid shows in terms of HCP range and distribution.
5. Decide correct rebid or action accordingly.

Hand: ${JSON.stringify(selectedHand)}

HCP: ${hcp}
Shape: ${shape}
Distribution:
S: ${distribution.S}
H: ${distribution.H}
D: ${distribution.D}
C: ${distribution.C}

Auction (chronological, dealer first):
${JSON.stringify(auction, null, 2)}

Dealer: ${dealer}
Vulnerability: ${vulnerability}

Return STRICT JSON:
{
  "bid": "string",
  "analysis": "explain interpretation of last bid",
  "explanation": "final concise reasoning"
}
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
      model: "gpt-5.2",
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

app.listen(3001, () => {
  console.log("Server running on port 3001");
});