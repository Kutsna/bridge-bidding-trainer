console.log("THIS IS BACKEND SERVER");
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config();

const app = express();
app.use(cors());

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const CARD_CODE_RE = /^(?:[AKQJT98765432][SHDC])$/;

function extractJson(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeCards(cards) {
  if (!Array.isArray(cards)) return [];
  const seen = new Set();
  const normalized = [];

  for (const raw of cards) {
    const code = String(raw || "").trim().toUpperCase();
    if (!CARD_CODE_RE.test(code)) continue;
    if (seen.has(code)) continue;
    seen.add(code);
    normalized.push(code);
  }

  return normalized;
}

app.get("/", (req, res) => {
  res.send("Backend is running");
});

const analyzeCardsHandler = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64Image = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-5.mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are reading one bridge hand from a single photo.

Return ONLY JSON:
{
  "cards": ["AS", "KH", "QD", "JC", "TS", "9H", "8D", "7C", "6S", "5H", "4D", "3C", "2S"]
}

Rules:
- Ranks: A,K,Q,J,T,9,8,7,6,5,4,3,2
- Suits: S,H,D,C
- Diamonds = D
- Return exactly 13 unique cards
- No explanation.
`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      temperature: 0,
    });

    const result = response.choices?.[0]?.message?.content || "";
    const parsed = extractJson(result);
    const cards = normalizeCards(parsed?.cards);

    if (cards.length !== 13) {
      return res.status(422).json({
        error: "Model did not return exactly 13 unique cards",
        cards,
      });
    }

    res.json({ cards });
  } catch (error) {
    console.error("Vision error:", error);
    res.status(500).json({ error: "Vision processing failed" });
  }
};

app.post("/analyze-cards", upload.single("image"), analyzeCardsHandler);
app.post("/analyze-card", upload.single("image"), analyzeCardsHandler);

app.listen(process.env.PORT || 3001, () => {
  console.log("Server running on port 3001");
});
