require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { OpenAI } = require('openai'); // DeepSeek uses OpenAI SDK

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// DeepSeek client
const client = new OpenAI({
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseURL: 'https://api.deepseek.com'
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
        const completion = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that always responds with valid JSON only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.3,
            max_tokens: 2048,
            response_format: { type: 'json_object' }
        });

        const responseText = completion.choices[0].message.content;
        console.log('DeepSeek response:', responseText);

        let parsed;
        try {
            parsed = JSON.parse(responseText);
        } catch (e) {
            console.log('JSON parse failed, extracting main field');
            const mainMatch = responseText.match(/"main"\s*:\s*"([^"]*)/);
            if (mainMatch) {
                return {
                    original: text,
                    translation_main: mainMatch[1].replace(/\\+$/, '').trim(),
                    alternatives: [],
                    tone: 'neutral'
                };
            }
            throw e;
        }

        return {
            original: text,
            translation_main: parsed.main || text,
            alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
            tone: parsed.tone || 'neutral'
        };

    } catch (err) {
        console.error('DeepSeek error:', err);
        return {
            original: text,
            translation_main: text,
            alternatives: [],
            tone: 'neutral',
            error: 'Translation failed'
        };
    }
}

// ----------------------------------------------------------------------
// REPLY SUGGESTION ENDPOINT
// ----------------------------------------------------------------------
app.post('/suggest-replies', async (req, res) => {
    const { text, category } = req.body;
    if (!text || !category) {
        return res.status(400).json({ error: 'text and category required' });
    }

    const prompt = `You are an expert in crafting engaging, natural replies. Based on the following Indonesian message: "${text}", generate 3-5 replies in English that match the tone and category: "${category}".

The replies should be creative, context-aware, and sound like something a real person would send. They can range from friendly to flirtatious to intimate, depending on the category.

Return ONLY a JSON array of strings, e.g. ["reply1", "reply2", "reply3"]. Do NOT include any other text, markdown, or explanations.`;

    try {
        const completion = await client.chat.completions.create({
            model: 'deepseek-chat',
            messages: [
                { role: 'system', content: 'You are a helpful assistant that always responds with valid JSON arrays.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.8,
            max_tokens: 2048,
            response_format: { type: 'json_object' }
        });

        const responseText = completion.choices[0].message.content;
        console.log('DeepSeek suggestion response:', responseText);

        let replies;
        try {
            const cleaned = responseText.replace(/```json\s*|\s*```/g, '');
            replies = JSON.parse(cleaned);
        } catch (e) {
            console.log('JSON parse failed, extracting quoted strings');
            const matches = responseText.match(/"([^"\\]*(\\.[^"\\]*)*)"/g);
            replies = matches ? matches.map(m => JSON.parse(m)) : getFallbackReplies(category);
        }

        if (!Array.isArray(replies)) replies = getFallbackReplies(category);
        res.json(replies.slice(0, 5));

    } catch (err) {
        console.error('Reply suggestion error:', err);
        res.json(getFallbackReplies(category));
    }
});

// Fallback replies
function getFallbackReplies(category) {
    const lowerCat = category.toLowerCase();
    if (lowerCat.includes('friendly')) {
        return ["That's cool!", "I hear you.", "Sounds good!"];
    } else if (lowerCat.includes('playful')) {
        return ["Haha you're funny 😄", "Oh stop it you 😜", "You're too much!"];
    } else if (lowerCat.includes('love') || lowerCat.includes('caring')) {
        return ["I care about you ❤️", "You mean a lot to me.", "Sending you a warm hug."];
    } else if (lowerCat.includes('supportive')) {
        return ["I'm here for you.", "You've got this!", "Stay strong 💪"];
    } else if (lowerCat.includes('tease')) {
        return ["Oh really? 😏", "Sure you did 😉", "You're impossible 😆"];
    } else if (lowerCat.includes('naughty') || lowerCat.includes('sexy') || lowerCat.includes('erotic') || lowerCat.includes('sexual')) {
        return ["You're tempting me...", "I like where this is going.", "Keep talking like that..."];
    } else {
        return ["Interesting...", "Tell me more.", "I see."];
    }
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
