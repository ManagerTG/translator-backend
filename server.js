import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// test route
app.get("/", (req, res) => {
  res.send("Backend working ✅");
});

// main translate route
app.post("/translate", async (req, res) => {
  try {
    const { texts, source, target } = req.body;

    const results = [];

    for (const text of texts) {
      const prompt = `
Translate this text smartly.

Text: "${text}"

Give only translation. Keep meaning natural.
`;

      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      results.push({
        original: text,
        translation: response.choices[0].message.content.trim()
      });
    }

    res.json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Translation failed" });
  }
});

app.listen(3000, () => console.log("Server running"));
