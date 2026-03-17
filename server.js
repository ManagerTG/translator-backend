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

  // Prompt engineered for human-like translation with JSON output
  const prompt = `You are a professional Indonesian–English translator. Translate the following Indonesian text into natural, conversational English. Handle slang (e.g., "wkwk" → "lol", "iyoo" → "yeah"), fix broken grammar, and adapt to the emotional tone.

If the sentence has more than one possible interpretation, provide 2–3 alternative translations. Also detect the tone: playful, sad, romantic, neutral, or other.

Return a valid JSON object with these exact keys:
- "main": the primary translation (string)
- "alternatives": array of strings (0–3 items)
- "tone": string describing the emotional tone

Text: "${text}"

JSON:`;

  try {
    // Set generation config to encourage JSON output
    const generationConfig = {
      temperature: 0.3,       // lower temperature for consistent output
      maxOutputTokens: 500,
      // If using SDK version >= 0.13.0, you can force JSON output with:
      // responseMimeType: "application/json",
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response:', responseText); // helpful for debugging

    let parsed;

    // Try to extract JSON from markdown code block first (e.g., ```json ... ```)
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Fallback: find the first outermost JSON object
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (!objectMatch) throw new Error('No JSON found in response');
      parsed = JSON.parse(objectMatch[0]);
    }

    return {
      original: text,
      translation_main: parsed.main || text,
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      tone: parsed.tone || 'neutral',
    };
  } catch (err) {
    console.error('Gemini error for text:', text, err.message, err.stack);
    // Fallback: return original text with error indicator
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
