require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // serve index.html from root

// Initialize Gemini with the correct model (gemini-2.5-flash is available)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash', // Updated from 1.5-flash to a currently available model
});

// Translation endpoint
app.post('/translate', async (req, res) => {
  const { texts } = req.body; // array of strings

  if (!Array.isArray(texts)) {
    return res.status(400).json({ error: 'texts must be an array' });
  }

  try {
    // Process each text in parallel
    const translations = await Promise.all(texts.map(text => translateText(text)));
    res.json(translations);
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation service unavailable' });
  }
});

/**
 * Calls Gemini to translate a single text with alternatives and tone.
 */
async function translateText(text) {
  // If input is empty, return empty result
  if (!text.trim()) {
    return {
      original: text,
      translation_main: '',
      alternatives: [],
      tone: 'neutral'
    };
  }

  // 🔥 STRONGER PROMPT: insist on pure JSON, no extra text
  const prompt = `You are a professional Indonesian–English translator. Translate the following Indonesian text into natural, conversational English. Handle slang (e.g., "wkwk" → "lol", "iyoo" → "yeah"), fix broken grammar, and adapt to the emotional tone.

If the sentence has more than one possible interpretation, provide 2–3 alternative translations. Also detect the tone: playful, sad, romantic, neutral, or other.

**IMPORTANT**: Your response must be ONLY a valid JSON object with these exact keys. Do NOT include any explanations, markdown formatting, or extra text before or after the JSON.

{
  "main": "the primary translation",
  "alternatives": ["alternative 1", "alternative 2"],
  "tone": "tone description"
}

Text: "${text}"

JSON:`;

  try {
    // Set generation config – if SDK version >= 0.13.0, you can uncomment responseMimeType
    const generationConfig = {
      temperature: 0.3,
      maxOutputTokens: 500,
      // responseMimeType: "application/json", // Uncomment if you update SDK
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response:', responseText); // 👈 CHECK THIS IN RENDER LOGS

    let parsed;
    let translationMain = text; // fallback
    let alternatives = [];
    let tone = 'neutral';

    // Try to extract JSON from markdown code block first
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Try to find any JSON object
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          parsed = JSON.parse(objectMatch[0]);
        } catch (e) {
          // Not valid JSON – ignore
        }
      }
    }

    if (parsed) {
      translationMain = parsed.main || text;
      alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
      tone = parsed.tone || 'neutral';
    } else {
      // 🔥 If no JSON found, assume the whole response is the translation (if it's English-looking)
      // Simple heuristic: if response contains mostly English words (a-z, spaces, punctuation), use it.
      const englishLike = /^[A-Za-z0-9\s\.,!?'"-]+$/.test(responseText.trim());
      if (englishLike && responseText.length > 0) {
        translationMain = responseText.trim();
        console.log('Using raw response as translation:', translationMain);
      } else {
        console.warn('Response not JSON and not English-like, falling back to original');
      }
    }

    return {
      original: text,
      translation_main: translationMain,
      alternatives: alternatives,
      tone: tone,
    };
  } catch (err) {
    console.error('Gemini error for text:', text, err.message, err.stack);
    return {
      original: text,
      translation_main: text,
      alternatives: [],
      tone: 'neutral',
      error: 'AI translation failed, showing original',
    };
  }
}

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
