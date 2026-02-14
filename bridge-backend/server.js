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

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.post("/analyze-card", upload.single("image"), async (req, res) => {
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
You are reading a single playing card corner.

Return ONLY JSON:
{
  "card": "AS"
}

Rules:
- Ranks: A,K,Q,J,T,9,8,7,6,5,4,3,2
- Suits: S,H,D,C
- Diamonds = D
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

    const result = response.choices[0].message.content;

    res.json({ result });
  } catch (error) {
    console.error("Vision error:", error);
    res.status(500).json({ error: "Vision processing failed" });
  }
});

app.listen(process.env.PORT || 3001, () => {
  console.log("Server running on port 3001");
});
