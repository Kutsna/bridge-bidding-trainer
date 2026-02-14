console.log("THIS IS ROOT SERVER");
console.log("PORT:", process.env.PORT);
console.log("OPENAI KEY EXISTS:", !!process.env.OPENAI_API_KEY);

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
    console.log("POST HIT");
    console.log("FILE EXISTS:", !!req.file);

    if (!req.file) {
      return res.status(400).json({ error: "No image uploaded" });
    }

    const base64Image = req.file.buffer.toString("base64");

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // safer test model
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `
Return ONLY JSON:
{
  "cards": ["AS","KH","7D"]
}
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

    const content = response?.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(500).json({ error: "Empty OpenAI response" });
    }

    // Ensure valid JSON
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      return res.status(500).json({
        error: "OpenAI did not return valid JSON",
        raw: content,
      });
    }

    return res.json(parsed);

  } catch (err) {
    console.error("VISION ERROR:", err);
    return res.status(500).json({
      error: "Vision failed",
      details: String(err),
    });
  }
});