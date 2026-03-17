require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// Initialize Gemini (using a stable, fast model)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',  // or 'gemini-2.0-flash' – both work
});

// ----------------------------------------------------------------------
// TRANSLATION ENDPOINT
// ----------------------------------------------------------------------
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
      // If you've updated the SDK to >=0.13.0, uncomment the line below to force pure JSON:
      // responseMimeType: "application/json",
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

    // Attempt to parse JSON (handle markdown fences)
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
        // If the whole response looks like plain English, use it directly
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
    console.error('Gemini error in translateText:', err);
    return {
      original: text,
      translation_main: text,
      alternatives: [],
      tone: 'neutral',
      error: 'AI translation failed',
    };
  }
}

// ----------------------------------------------------------------------
// REPLY SUGGESTION ENDPOINT (with robust parsing & always returns an array)
// ----------------------------------------------------------------------
app.post('/suggest-replies', async (req, res) => {
  const { text, category } = req.body;
  if (!text || !category) {
    return res.status(400).json({ error: 'text and category required' });
  }

  // Enhanced prompt: explicitly ask for a JSON array, no extra text
  const prompt = `You are an expert in crafting engaging, natural replies. Based on the following Indonesian message: "${text}", generate 3-5 replies in English that match the tone and category: "${category}".

The replies should be creative, context-aware, and sound like something a real person would send. They can range from friendly to flirtatious to intimate, depending on the category.

Return ONLY a JSON array of strings, e.g. ["reply1", "reply2", "reply3"]. Do NOT include any other text, markdown, or explanations.`;

  try {
    const generationConfig = {
      temperature: 0.8,            // a bit higher for creative replies
      maxOutputTokens: 2048,       // increased to avoid truncation
      // responseMimeType: "application/json", // uncomment if SDK >= 0.13.0
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response (suggest):', responseText);

    let replies = [];

    // ---- Attempt 1: Parse full JSON array (with or without markdown) ----
    try {
      const cleaned = responseText.replace(/```json\s*|\s*```/g, '');
      replies = JSON.parse(cleaned);
      if (!Array.isArray(replies)) replies = [];
    } catch (e) {
      console.log('Full JSON parse failed, attempting to extract partial replies');

      // ---- Attempt 2: Extract all quoted strings (handles truncated arrays) ----
      const quoteMatches = responseText.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
      if (quoteMatches && quoteMatches.length > 0) {
        replies = quoteMatches.map(m => JSON.parse(m)); // safe because they're valid JSON strings
      } else {
        // ---- Attempt 3: Split by lines and take non-empty, non‑bracket lines ----
        replies = responseText
          .split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('[') && !line.startsWith(']') && !line.startsWith(','));
      }
    }

    // Ensure we always return an array (even if empty) to keep frontend happy
    if (!Array.isArray(replies)) replies = [];

    // Limit to 5 items max, and clean up any leftover escape characters
    replies = replies.slice(0, 5).map(r => 
      typeof r === 'string' ? r.replace(/\\"/g, '"').replace(/\\n/g, ' ') : String(r)
    );

    // If after all attempts we have no replies, provide a fallback based on category
    if (replies.length === 0) {
      replies = getFallbackReplies(category);
    }

    res.json(replies);
  } catch (err) {
    console.error('Reply suggestion error:', err);
    // Even on catastrophic failure, return a fallback so frontend never crashes
    res.json(getFallbackReplies(category));
  }
});

// ----------------------------------------------------------------------
// Fallback replies generator (ensures frontend always has something to show)
// ----------------------------------------------------------------------
function getFallbackReplies(category) {
  const lowerCat = category.toLowerCase();
  if (lowerCat.includes('friendly')) {
    return ["That's cool!", "I hear you.", "Sounds good!", "Alright, got it.", "Nice one!"];
  } else if (lowerCat.includes('playful')) {
    return ["Haha you're funny 😄", "Oh stop it you 😜", "You're too much!", "😏", "🙈"];
  } else if (lowerCat.includes('love') || lowerCat.includes('caring')) {
    return ["I care about you ❤️", "You mean a lot to me.", "Sending you a warm hug.", "Thinking of you.", "You're special."];
  } else if (lowerCat.includes('supportive')) {
    return ["I'm here for you.", "You've got this!", "Stay strong 💪", "I believe in you.", "Let me know if you need anything."];
  } else if (lowerCat.includes('tease')) {
    return ["Oh really? 😏", "Sure you did 😉", "Tell me another one!", "You're impossible 😆", "😜"];
  } else if (lowerCat.includes('naughty') || lowerCat.includes('sexy') || lowerCat.includes('erotic') || lowerCat.includes('sexual')) {
    // Tasteful but safe fallbacks – you can customise further
    return ["You're tempting me...", "I like where this is going.", "Keep talking like that...", "Mmm 😏", "You're making me blush."];
  } else {
    // Generic fallback
    return ["Interesting...", "Tell me more.", "I see.", "Got it.", "Okay."];
  }
}

// ----------------------------------------------------------------------
// Start the server
// ----------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
