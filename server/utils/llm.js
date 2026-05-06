const { OpenRouter } = require('@openrouter/sdk');

const openrouter = new OpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY
});

const NARRATION_PROMPT = `You are a professional technical presenter. 
PRIMARY CONTEXT: You are presenting the following specific slide content:
"{{slideText}}"

This is slide {{slideNumber}} of {{totalSlides}}.

Your goal is to provide a deep, expert explanation of ONLY the content provided above. 
Follow these strict rules:
1. FOCUS ON THIS SLIDE: Your narration must be directly relevant to the specific points, data, or concepts found in the "Slide Content" above. 
2. DO NOT GIVE A GENERAL OVERVIEW: Do not repeat the project's overall mission unless it is specifically mentioned on this slide.
3. EXPLAIN, DON'T READ: Summarize the bullet points into a natural, conversational flow. Explain the "Why" and "How" behind the text.
4. TONE: Professional, expert, and clear. Avoid overly dramatic or "salesy" language.
5. STRUCTURE:
   - Start with a quick transition from the previous slide.
   - Spend the majority of the time (4-6 sentences) explaining the specific details of THIS slide.
   - End with a single sentence linking to what might come next.
6. LENGTH: 5-8 sentences total.`;

const QA_PROMPT = `You are an AI presenter answering a live audience question during a presentation.
Current slide: Slide {{currentSlide}}
Full deck: {{allSlides}}
Question: {{question}}

Rules:
1. Answer concisely in 2-4 sentences.
2. Rate confidence: "high" / "medium" / "low"
3. If low, add disclaimer: "I'm not fully certain — please verify with the original source."
4. Never fabricate facts.

Respond ONLY in this exact JSON format:
{
  "answer": "your answer here",
  "confidence": "high | medium | low",
  "disclaimer": "optional disclaimer if confidence is low"
}
`;

async function generateNarration(slideText, slideNumber, totalSlides) {
  const prompt = NARRATION_PROMPT
    .replace('{{slideNumber}}', slideNumber)
    .replace('{{totalSlides}}', totalSlides)
    .replace('{{slideText}}', slideText);

  const response = await openrouter.chat.send({
    chatRequest: {
      model: 'openrouter/auto',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    }
  });

  return response.choices[0].message.content;
}

async function answerQuestion(question, currentSlide, allSlides) {
  const allSlidesText = allSlides
    .map(s => `Slide ${s.slideNumber}: ${s.text}`)
    .join('\n\n');

  const prompt = QA_PROMPT
    .replace('{{currentSlide}}', currentSlide)
    .replace('{{allSlides}}', allSlidesText)
    .replace('{{question}}', question);

  const response = await openrouter.chat.send({
    chatRequest: {
      model: 'openrouter/auto',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }]
    }
  });

  const raw = response.choices[0].message.content;
  const clean = raw.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { answer: raw, confidence: 'medium', disclaimer: '' };
  }
}

module.exports = { generateNarration, answerQuestion };