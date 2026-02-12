const express = require("express");
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Backend is running");
});

app.listen(3001, () => {
  console.log("Server running on port 3001");
});

const upload = multer({ storage: multer.memoryStorage() });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/analyze-cards", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64Image = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
You are analyzing a fan of playing cards.

Return ONLY strict JSON in this format:
{
  "cards": ["AS", "KH", "7D"]
}

Rules:
- Use ranks: A,K,Q,J,T,9,8,7,6,5,4,3,2
- Use suits: S,H,D,C
- No extra text.
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

    const content = response.choices[0].message.content;

    res.json({ result: content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Vision processing failed" });
  }
});

app.listen(process.env.PORT, () => {
  console.log("Server running on port " + process.env.PORT);
});
