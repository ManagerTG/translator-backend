async function translateText(text) {
  if (!text.trim()) {
    return { original: text, translation_main: '', alternatives: [], tone: 'neutral' };
  }

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
      // If using newer SDK, you can try responseMimeType: "application/json"
    };

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const responseText = result.response.text();
    console.log('Raw Gemini response:', responseText); // 👈 Add logging

    // Try to extract JSON from markdown code block first
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      var parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Fallback to plain JSON object extraction
      const objectMatch = responseText.match(/\{[\s\S]*\}/);
      if (!objectMatch) throw new Error('No JSON found');
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
    console.error('Raw response that caused error:', responseText); // log if defined
    return {
      original: text,
      translation_main: text,
      alternatives: [],
      tone: 'neutral',
      error: 'AI translation failed, showing original',
    };
  }
}
