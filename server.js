require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('.'));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  // safetySettings: you can adjust if needed
});

// ---------- translation endpoint ----------
app.post('/translate', async (req, res) => {
  const { texts } = req.body;
  if (!Array.isArray(texts)) {
    return res.status(400).json({ error: 'texts must be an array' });
  }
  try {
    const translations = await Promise.all(texts.map(text => translateText(text)));
    res.json(translations);
  } catch (error) {
    console.error('Translation error:', error);
    res.status(500).json({ error: 'Translation service unavailable' });
  }
});

async function translateText(text) {
  if (!text.trim()) {
    return { original: text, translation_main: '', alternatives: [], tone: 'neutral' };
  }

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
    const generationConfig = {
      temperature: 0.3,
      maxOutputTokens: 2048,
      // responseMimeType: "application/json", // uncomment if SDK >= 0.13.0
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response (translate):', responseText);

    let translationMain = text;
    let alternatives = [];
    let tone = 'neutral';

    // Attempt to parse JSON (handling markdown fences)
    try {
      const cleaned = responseText.replace(/```json\s*|\s*```/g, '');
      const parsed = JSON.parse(cleaned);
      translationMain = parsed.main || text;
      alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
      tone = parsed.tone || 'neutral';
    } catch (e) {
      console.log('JSON parse failed, using fallback extraction');
      const mainMatch = responseText.match(/"main"\s*:\s*"([^"]*)/);
      if (mainMatch && mainMatch[1]) {
        translationMain = mainMatch[1].replace(/\\+$/, '').trim();
      } else {
        // If response looks like plain English, use it
        if (/^[A-Za-z0-9\s\.,!?'"-]+$/.test(responseText.trim())) {
          translationMain = responseText.trim();
        }
      }
      const toneMatch = responseText.match(/"tone"\s*:\s*"([^"]+)/);
      if (toneMatch) tone = toneMatch[1];
    }

    return {
      original: text,
      translation_main: translationMain,
      alternatives: alternatives,
      tone: tone,
    };
  } catch (err) {
    console.error('Gemini error:', err);
    return {
      original: text,
      translation_main: text,
      alternatives: [],
      tone: 'neutral',
      error: 'AI translation failed',
    };
  }
}

// ---------- new endpoint: suggest replies ----------
app.post('/suggest-replies', async (req, res) => {
  const { text, category } = req.body;
  if (!text || !category) {
    return res.status(400).json({ error: 'text and category required' });
  }

  const prompt = `You are a helpful assistant that suggests replies in English for someone who received the following Indonesian message: "${text}"

The user wants replies that are: ${category}. 
Generate 3-5 natural, context-aware, and engaging replies in English. They should sound like something a real person would send. Return ONLY a JSON array of strings, e.g. ["reply1", "reply2", "reply3"]. Do not include any other text.`;

  try {
    const generationConfig = {
      temperature: 0.7, // a bit more creative
      maxOutputTokens: 800,
      // responseMimeType: "application/json",
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response (suggest):', responseText);

    // Extract JSON array
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return res.json(['Sorry, no suggestions could be generated.']);
    }
    const replies = JSON.parse(jsonMatch[0]);
    res.json(replies.slice(0, 5)); // ensure max 5
  } catch (err) {
    console.error('Reply suggestion error:', err);
    res.status(500).json({ error: 'Failed to generate replies' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
