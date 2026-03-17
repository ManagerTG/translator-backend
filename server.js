import express from "express";
import cors from "cors";

const app = express();

app.use(cors());
app.use(express.json());

// test route
app.get("/", (req, res) => {
  res.send("Backend working ✅ (FREE MODE)");
});

app.post("/translate", async (req, res) => {
  try {
    const { texts } = req.body;

    const results = await Promise.all(
      texts.map(async (text) => {
        const response = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=id|en`
        );

        const data = await response.json();

        return {
          original: text,
          translation: data.responseData.translatedText
        };
      })
    );

    res.json(results);

  } catch (err) {
    res.status(500).json({ error: "Translation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
