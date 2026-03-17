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
});

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
      maxOutputTokens: 1024, // Increased to avoid truncation
      // responseMimeType: "application/json", // Uncomment if SDK >= 0.13.0
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response:', responseText); // Check full output in logs

    let translationMain = text;
    let alternatives = [];
    let tone = 'neutral';

    // --- Attempt 1: Extract complete JSON ---
    try {
      // Remove markdown code fences
      const cleaned = responseText.replace(/```json\s*|\s*```/g, '');
      const parsed = JSON.parse(cleaned);
      translationMain = parsed.main || text;
      alternatives = Array.isArray(parsed.alternatives) ? parsed.alternatives : [];
      tone = parsed.tone || 'neutral';
      console.log('Successfully parsed JSON');
    } catch (e) {
      console.log('JSON parse failed, attempting fallback extraction');

      // --- Attempt 2: Extract "main" field using regex (works even if JSON is truncated) ---
      const mainMatch = responseText.match(/"main"\s*:\s*"([^"\\]*(\\.[^"\\]*)*)"/);
      if (mainMatch && mainMatch[1]) {
        translationMain = mainMatch[1].replace(/\\"/g, '"'); // unescape quotes
        console.log('Extracted main from partial JSON:', translationMain);
      } else {
        // --- Attempt 3: If response looks like plain English (no JSON braces), use it directly ---
        const looksLikeEnglish = /^[A-Za-z0-9\s\.,!?'"-]+$/.test(responseText.trim());
        if (looksLikeEnglish && responseText.length > 0) {
          translationMain = responseText.trim();
          console.log('Using raw response as translation');
        } else {
          console.warn('Could not extract translation, falling back to original');
        }
      }

      // Try to extract tone if present in partial
      const toneMatch = responseText.match(/"tone"\s*:\s*"([^"]+)"/);
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
