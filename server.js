import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import express from "express";
import multer from "multer";
import OpenAI from "openai";

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// API endpoint
app.post("/analyze-cards", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64Image = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are analyzing a fan of 13 playing cards.

Return ONLY JSON:
{
  "cards": ["AS","KH","7D"]
}

Ranks: A,K,Q,J,T,9,8,7,6,5,4,3,2
Suits: S,H,D,C
No explanation.
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

    console.log("Sending response to frontend...");

    res.json({
      result: response?.choices?.[0]?.message?.content || null,
    });
  } catch (err) {
    console.error("VISION ERROR:", err);
    res.status(500).json({
      error: "Vision failed",
      details: String(err),
    });
  }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "dist")));

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist/index.html'));
});

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
