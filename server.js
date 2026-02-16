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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.post("/analyze-cards", upload.single("image"), async (req, res) => {
  console.log("Analyze route hit");

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

    const text = response.output_text;
    const cards = JSON.parse(text);

    res.json({ cards });

  } catch (err) {
    console.error("Recognition error:", err);
    res.status(500).json({ error: "Recognition failed" });
  }
});

// 🔥 SERVE BUILT FRONTEND
app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});