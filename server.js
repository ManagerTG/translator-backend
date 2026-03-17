import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// 🔥 SLANG DICTIONARY (VERY IMPORTANT)
const slangMap = {
  "kmu": "kamu",
  "trs": "terus",
  "ntar": "nanti",
  "blg": "bilang",
  "nyaa": "nya",
  "mkn": "makan",
  "lh": "",
  "itu lh": "itu",
  "bgusss": "bagus",
  "bgus": "bagus",
  "bguss": "bagus",
  "wkwk": "haha",
};

// 🔥 PREPROCESS TEXT (CLEAN INPUT)
function cleanText(text) {
  let words = text.split(" ");

  words = words.map(word => {
    return slangMap[word.toLowerCase()] || word;
  });

  return words.join(" ");
}

// 🔥 POST PROCESS (MAKE NATURAL)
function improveTranslation(text) {
  return text
    .replace("you left me again", "you left me again 😒")
    .replace("this afternoon", "later this afternoon")
    .replace("eat", "go eat")
    .replace("i", "I");
}

app.get("/", (req, res) => {
  res.send("Smart Translator Running ✅");
});

app.post("/translate", async (req, res) => {
  try {
    const { texts } = req.body;

    const results = await Promise.all(
      texts.map(async (text) => {
        
        // 🔥 STEP 1: CLEAN TEXT
        const cleaned = cleanText(text);

        // 🔥 STEP 2: CALL FREE API
        const response = await fetch(
          `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleaned)}&langpair=id|en`
        );

        const data = await response.json();
        let translated = data.responseData.translatedText;

        // 🔥 STEP 3: IMPROVE OUTPUT
        translated = improveTranslation(translated);

        return {
          original: text,
          cleaned,
          translation: translated
        };
      })
    );

    res.json(results);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Translation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
